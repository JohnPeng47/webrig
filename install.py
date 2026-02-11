#!/usr/bin/env python3
"""
Unified installer for the WebRig browser extension + native messaging host.

Usage:
    python install.py              # full install (build + register)
    python install.py --skip-build # skip npm build, just register native host
    python install.py <ext-id>     # use a specific extension ID

Works on Windows, macOS, and Linux.

Steps performed:
  1. Check prerequisites (Node.js, npm, Python 3, pip)
  2. Install npm dependencies and build the extension
  3. Install Python dependencies (websockets)
  4. Prompt to load extension in Chrome (if not already detected)
  5. Auto-detect or accept extension ID
  6. Generate native messaging host manifest + wrapper script
  7. Register native messaging host with Chrome
"""

import glob
import json
import os
import platform
import shutil
import signal
import socket
import subprocess
import sys

HOST_NAME = "com.claude.browser_agent"
WS_PORT = 7680

SYSTEM = platform.system()

# Directories relative to this script
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DIST_DIR = os.path.join(SCRIPT_DIR, "dist")
NATIVE_HOST_DIR = os.path.join(SCRIPT_DIR, "native-host")
HOST_SCRIPT = os.path.join(NATIVE_HOST_DIR, "host.py")


def get_webrig_dir() -> str:
    """Return platform-appropriate .webrig app data directory."""
    if SYSTEM == "Windows":
        base = os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))
        return os.path.join(base, ".webrig")
    elif SYSTEM == "Darwin":
        return os.path.expanduser("~/Library/Application Support/.webrig")
    else:
        return os.path.expanduser("~/.local/share/.webrig")


WEBRIG_DIR = get_webrig_dir()


# ── Helpers ──────────────────────────────────────────────────────

def info(msg: str) -> None:
    print(f"  [+] {msg}")


def warn(msg: str) -> None:
    print(f"  [!] {msg}")


def error(msg: str) -> None:
    print(f"  [x] {msg}")


def header(msg: str) -> None:
    print(f"\n{'='*60}")
    print(f"  {msg}")
    print(f"{'='*60}")


def run(cmd: list[str], cwd: str | None = None, check: bool = True) -> subprocess.CompletedProcess:
    """Run a command, printing it first."""
    display = " ".join(cmd)
    info(f"Running: {display}")
    return subprocess.run(cmd, cwd=cwd, check=check)


def which(name: str) -> str | None:
    """Cross-platform which."""
    return shutil.which(name)


def prompt_yn(question: str, default: bool = True) -> bool:
    suffix = " [Y/n] " if default else " [y/N] "
    answer = input(question + suffix).strip().lower()
    if not answer:
        return default
    return answer in ("y", "yes")


# ── 1. Prerequisites ────────────────────────────────────────────

def check_prerequisites() -> bool:
    header("Checking prerequisites")
    ok = True

    # Node.js
    node = which("node")
    if node:
        version = subprocess.check_output([node, "--version"], text=True).strip()
        info(f"Node.js: {version} ({node})")
    else:
        error("Node.js not found. Install from https://nodejs.org/")
        ok = False

    # npm (on Windows this is npm.cmd, so we must use the resolved path)
    npm = which("npm")
    if npm:
        version = subprocess.check_output([npm, "--version"], text=True).strip()
        info(f"npm: {version} ({npm})")
    else:
        error("npm not found. It should come with Node.js.")
        ok = False

    # Python 3 (we're running in it, so just report)
    info(f"Python: {sys.version.split()[0]} ({sys.executable})")

    # pip — check we can import pip or find it
    try:
        subprocess.check_output(
            [sys.executable, "-m", "pip", "--version"],
            text=True, stderr=subprocess.DEVNULL,
        )
        info("pip: available")
    except (subprocess.CalledProcessError, FileNotFoundError):
        warn("pip not found. Python dependencies will need manual install.")

    # Check native-host/host.py exists
    if os.path.exists(HOST_SCRIPT):
        info(f"Native host script: {HOST_SCRIPT}")
    else:
        error(f"Native host script not found at: {HOST_SCRIPT}")
        ok = False

    return ok


# ── 2. Build extension ──────────────────────────────────────────

def build_extension() -> bool:
    header("Building extension")

    npm = which("npm")
    if not npm:
        error("npm not found. Cannot build.")
        return False

    # npm install
    info("Installing npm dependencies...")
    result = subprocess.run([npm, "install"], cwd=SCRIPT_DIR)
    if result.returncode != 0:
        error("npm install failed.")
        return False

    # npm run build
    info("Building extension (vite + tsc)...")
    result = subprocess.run([npm, "run", "build"], cwd=SCRIPT_DIR)
    if result.returncode != 0:
        error("Extension build failed.")
        return False

    if os.path.isdir(DIST_DIR):
        info(f"Build output: {DIST_DIR}")
    else:
        error(f"dist/ directory not found after build.")
        return False

    return True


# ── 3. Python dependencies ──────────────────────────────────────

def install_python_deps() -> bool:
    header("Installing Python dependencies")
    try:
        import websockets  # noqa: F401
        info("websockets already installed")
        return True
    except ImportError:
        pass

    info("Installing websockets...")
    result = subprocess.run(
        [sys.executable, "-m", "pip", "install", "websockets"],
        check=False,
    )
    if result.returncode != 0:
        error("Failed to install websockets. Install manually: pip install websockets")
        return False
    info("websockets installed")
    return True


# ── 4. Chrome extension ID detection ────────────────────────────

def chrome_user_data_dir() -> str:
    if SYSTEM == "Windows":
        return os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\User Data")
    elif SYSTEM == "Darwin":
        return os.path.expanduser("~/Library/Application Support/Google/Chrome")
    else:
        return os.path.expanduser("~/.config/google-chrome")


def _is_our_extension(ext_path: str, ext_info: dict) -> bool:
    """Determine if a Chrome extension entry is ours.

    Only matches extensions whose source directory still exists on disk
    (stale prefs entries from deleted/renamed dirs are skipped).

    Checks (in order):
      1. Exact path match against current dist/ dir
      2. Manifest on disk has name "Claude (Headless)"
    """
    # Skip entries where the extension directory no longer exists —
    # these are stale Chrome prefs from deleted/renamed folders
    if not os.path.isdir(ext_path):
        return False

    dist_norm = os.path.normcase(os.path.normpath(DIST_DIR))
    ext_path_norm = os.path.normcase(os.path.normpath(ext_path))

    # Match 1: exact dist/ path
    if ext_path_norm == dist_norm:
        return True

    # Match 2: manifest on disk has our extension name
    manifest_candidate = os.path.join(ext_path, "manifest.json")
    try:
        with open(manifest_candidate, "r", encoding="utf-8") as mf:
            manifest = json.load(mf)
        if manifest.get("name") == "Claude (Headless)":
            return True
    except (json.JSONDecodeError, OSError):
        pass

    return False


def detect_extension_installations() -> list[dict]:
    """Scan Chrome profiles for our extension.

    Returns a list of dicts with keys: id, profile, profile_name, ext_path.
    A single extension ID can appear in multiple profiles.
    """
    chrome_dir = chrome_user_data_dir()
    results: list[dict] = []

    for prefs_path in glob.glob(os.path.join(chrome_dir, "*", "Secure Preferences")):
        try:
            with open(prefs_path, "r", encoding="utf-8") as f:
                prefs = json.load(f)
        except (json.JSONDecodeError, OSError):
            continue

        profile_dir = os.path.basename(os.path.dirname(prefs_path))

        # Profile name lives in Preferences (not Secure Preferences)
        profile_name = profile_dir
        regular_prefs_path = os.path.join(os.path.dirname(prefs_path), "Preferences")
        try:
            with open(regular_prefs_path, "r", encoding="utf-8") as f:
                regular_prefs = json.load(f)
            name = regular_prefs.get("profile", {}).get("name")
            acct = regular_prefs.get("account_info", [])
            email = acct[0].get("email") if acct else None
            # Show "Name (email)" if both available, else just the name
            if name and email:
                profile_name = f"{name} ({email})"
            elif name:
                profile_name = name
        except (json.JSONDecodeError, OSError):
            pass

        exts = prefs.get("extensions", {}).get("settings", {})
        for ext_id, ext_info in exts.items():
            ext_path = ext_info.get("path", "")
            if not ext_path:
                continue

            if _is_our_extension(ext_path, ext_info):
                results.append({
                    "id": ext_id,
                    "profile": profile_dir,
                    "profile_name": profile_name,
                    "ext_path": ext_path,
                })

    return results


def print_extension_summary(installations: list[dict]) -> None:
    """Print a table of all Chrome profiles where the extension is installed."""
    if not installations:
        return

    # Deduplicate by (id, profile)
    unique = {(i["id"], i["profile"]): i for i in installations}
    rows = sorted(unique.values(), key=lambda r: (r["id"], r["profile"]))

    # Collect unique IDs
    unique_ids = sorted({r["id"] for r in rows})
    multi_id = len(unique_ids) > 1

    # Compute column width from longest profile name
    max_name = max(len(r["profile_name"]) for r in rows)
    col_w = max(max_name + 2, 20)
    table_w = col_w + 34

    print()
    print(f"  Extension installed in {len(rows)} Chrome profile(s):")
    print(f"  {'─' * table_w}")
    print(f"  {'Profile':<{col_w}} {'Extension ID'}")
    print(f"  {'─' * table_w}")
    for row in rows:
        print(f"  {row['profile_name']:<{col_w}} {row['id']}")
    print(f"  {'─' * table_w}")

    if multi_id:
        warn(
            f"Multiple extension IDs detected ({len(unique_ids)}). "
            "This is normal if loaded in different profiles."
        )
        info("All IDs will be registered as allowed origins.")
    print()


def get_extension_ids(cli_id: str | None) -> list[str]:
    header("Detecting extension ID")

    if cli_id:
        info(f"Using provided extension ID: {cli_id}")
        return [cli_id]

    # First scan — maybe the extension is already loaded
    info("Scanning Chrome profiles...")
    installations = detect_extension_installations()

    if installations:
        print_extension_summary(installations)
        unique_ids = sorted({i["id"] for i in installations})
        return unique_ids

    # Not found — guide the user to load it first, then retry
    warn("Extension not found in any Chrome profile.")
    print()
    print("  The extension must be loaded in Chrome before registration.")
    print("  Please do this now:")
    print()
    print("    1. Open Chrome and go to chrome://extensions")
    print("    2. Enable 'Developer mode' (top-right toggle)")
    print(f"    3. Click 'Load unpacked' and select:")
    print(f"       {DIST_DIR}")
    print()

    input("  Press Enter after loading the extension in Chrome...")
    print()

    # Second scan — retry after user loaded it
    info("Re-scanning Chrome profiles...")
    installations = detect_extension_installations()

    if installations:
        print_extension_summary(installations)
        unique_ids = sorted({i["id"] for i in installations})
        return unique_ids

    # Still not found — fall back to manual entry
    warn("Still not detected. Chrome may need to be restarted first.")
    print("  You can also enter the extension ID manually.")
    print("  (Find it on the chrome://extensions page under the extension name)")
    print()

    user_id = input("  Enter extension ID (or press Enter to abort): ").strip()
    if not user_id:
        error("No extension ID provided. Aborting.")
        sys.exit(1)

    return [user_id]


# ── 5. Kill stale processes ─────────────────────────────────────

def kill_process_on_port(port: int) -> None:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.settimeout(1)
        if sock.connect_ex(("127.0.0.1", port)) != 0:
            return
    finally:
        sock.close()

    warn(f"Port {port} is in use — killing stale process...")

    try:
        if SYSTEM == "Windows":
            output = subprocess.check_output(
                ["netstat", "-ano"], text=True, stderr=subprocess.DEVNULL
            )
            for line in output.splitlines():
                if f":{port}" in line and "LISTENING" in line:
                    pid = int(line.strip().split()[-1])
                    info(f"Killing PID {pid}")
                    subprocess.call(
                        ["taskkill", "/PID", str(pid), "/F"],
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                    )
        else:
            output = subprocess.check_output(
                ["lsof", "-ti", f":{port}"], text=True, stderr=subprocess.DEVNULL
            ).strip()
            for pid_str in output.splitlines():
                pid = int(pid_str)
                info(f"Killing PID {pid}")
                os.kill(pid, signal.SIGTERM)
    except (subprocess.CalledProcessError, FileNotFoundError, ValueError):
        warn(f"Could not auto-kill process on port {port}. Free it manually if needed.")
        return

    info(f"Port {port} freed.")


# ── 6. Register native messaging host ───────────────────────────

def create_wrapper_script() -> str:
    """Create the platform-specific wrapper that Chrome launches."""
    os.makedirs(WEBRIG_DIR, exist_ok=True)

    if SYSTEM == "Windows":
        bat_path = os.path.join(WEBRIG_DIR, "host.bat")
        python_exe = sys.executable.replace("/", "\\")
        host_script_win = HOST_SCRIPT.replace("/", "\\")
        with open(bat_path, "w") as f:
            f.write(f'@echo off\r\n"{python_exe}" "{host_script_win}" %*\r\n')
        info(f"Created wrapper: {bat_path}")
        return bat_path
    else:
        # Ensure host.py is executable with a shebang
        os.chmod(HOST_SCRIPT, 0o755)
        with open(HOST_SCRIPT, "r") as f:
            content = f.read()
        if not content.startswith("#!"):
            with open(HOST_SCRIPT, "w") as f:
                f.write(f"#!{sys.executable}\n" + content)
            info(f"Added shebang to {HOST_SCRIPT}")
        info(f"Host script: {HOST_SCRIPT}")
        return HOST_SCRIPT


def write_manifest(host_path: str, origins: list[str]) -> str:
    manifest_path = os.path.join(WEBRIG_DIR, f"{HOST_NAME}.json")
    manifest = {
        "name": HOST_NAME,
        "description": "Browser extension native messaging host",
        "path": host_path.replace("/", "\\") if SYSTEM == "Windows" else host_path,
        "type": "stdio",
        "allowed_origins": origins,
    }
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    info(f"Wrote manifest: {manifest_path}")
    return manifest_path


def register_windows(manifest_path: str) -> None:
    import winreg
    key_path = f"Software\\Google\\Chrome\\NativeMessagingHosts\\{HOST_NAME}"
    try:
        key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path)
        winreg.SetValueEx(key, "", 0, winreg.REG_SZ, manifest_path)
        winreg.CloseKey(key)
        info(f"Registered in registry: HKCU\\{key_path}")
    except Exception as e:
        error(f"Failed to write registry: {e}")
        print(f"  Manually create: HKCU\\{key_path} = {manifest_path}")


def register_macos(manifest_path: str) -> None:
    target_dir = os.path.expanduser(
        "~/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    )
    os.makedirs(target_dir, exist_ok=True)
    target = os.path.join(target_dir, f"{HOST_NAME}.json")
    if os.path.exists(target):
        os.remove(target)
    os.symlink(manifest_path, target)
    info(f"Symlinked: {target} -> {manifest_path}")


def register_linux(manifest_path: str) -> None:
    target_dir = os.path.expanduser("~/.config/google-chrome/NativeMessagingHosts")
    os.makedirs(target_dir, exist_ok=True)
    target = os.path.join(target_dir, f"{HOST_NAME}.json")
    if os.path.exists(target):
        os.remove(target)
    os.symlink(manifest_path, target)
    info(f"Symlinked: {target} -> {manifest_path}")


def register_native_host(extension_ids: list[str]) -> None:
    header("Registering native messaging host")

    origins = [f"chrome-extension://{eid}/" for eid in extension_ids]
    info(f"Allowed origins: {origins}")

    kill_process_on_port(WS_PORT)

    host_path = create_wrapper_script()
    manifest_path = write_manifest(host_path, origins)

    if SYSTEM == "Windows":
        register_windows(manifest_path)
    elif SYSTEM == "Darwin":
        register_macos(manifest_path)
    else:
        register_linux(manifest_path)


# ── Main ─────────────────────────────────────────────────────────

def main() -> None:
    print()
    print("  WebRig Browser Extension Installer")
    print("  ===================================")
    print(f"  Platform: {SYSTEM} ({platform.machine()})")
    print(f"  Extension source: {SCRIPT_DIR}")
    print(f"  Native host:      {HOST_SCRIPT}")
    print(f"  App data dir:     {WEBRIG_DIR}")

    # Parse args
    skip_build = "--skip-build" in sys.argv
    cli_id = None
    for arg in sys.argv[1:]:
        if not arg.startswith("-"):
            cli_id = arg.strip()
            break

    # Step 1: Prerequisites
    if not check_prerequisites():
        error("Prerequisites check failed. Fix the issues above and retry.")
        sys.exit(1)

    # Step 2: Build extension
    if skip_build:
        info("Skipping build (--skip-build)")
        if not os.path.isdir(DIST_DIR):
            error(f"dist/ not found. Run without --skip-build first.")
            sys.exit(1)
    else:
        if not build_extension():
            sys.exit(1)

    # Step 3: Python dependencies
    if not install_python_deps():
        warn("Continuing without websockets — native host may fail at runtime.")

    # Step 3.5: Create .webrig app data directory
    header("Setting up app data directory")
    os.makedirs(WEBRIG_DIR, exist_ok=True)
    info(f"App data directory: {WEBRIG_DIR}")

    # Step 4: Extension ID (pauses here if extension not yet loaded in Chrome)
    extension_ids = get_extension_ids(cli_id)

    # Step 5: Register native host
    register_native_host(extension_ids)

    # Done — final summary
    header("Installation complete")
    print()
    print(f"  Registered {len(extension_ids)} extension ID(s):")
    for eid in extension_ids:
        print(f"    chrome-extension://{eid}/")
    print()
    print(f"  App data: {WEBRIG_DIR}")
    print()
    print("  Next steps:")
    print("    1. Restart Chrome (or reload the extension at chrome://extensions)")
    print(f"    2. Start the WebSocket server:")
    print(f'       python "{HOST_SCRIPT}"')
    print(f"    3. Server runs on ws://127.0.0.1:{WS_PORT}")
    print(f"    4. Logs are stored in: {WEBRIG_DIR}")
    print()
    print("  To reinstall after code changes:")
    print("    python install.py              # rebuild + re-register")
    print("    python install.py --skip-build # re-register only")
    print()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n  Aborted.")
        sys.exit(1)

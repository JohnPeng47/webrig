#!/usr/bin/env python3
"""
Unified installer for the WebRig browser extension + native messaging host.

Usage:
    python install.py              # full install (build + register)
    python install.py --skip-build # skip npm build, just register native host

Works on Windows, macOS, and Linux.

Steps performed:
  1. Clean up all previous installation traces
  2. Check prerequisites (Node.js, npm, Python 3, pip)
  3. Build the extension (once)
  4. Install Python dependencies (websockets)
  5. Enumerate Chrome profiles and prompt for selection
  6. For each selected profile, create a separate extension bundle
  7. Guide user to load each bundle, then confirm detection
  8. Register native messaging host with all detected extension IDs
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


# ── 1. Cleanup ──────────────────────────────────────────────────

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


def cleanup_previous_install() -> None:
    """Remove all traces of previous WebRig installations."""
    header("Cleaning up previous installation")

    # Kill stale process on WS port
    kill_process_on_port(WS_PORT)

    # Remove Windows registry entry
    if SYSTEM == "Windows":
        try:
            import winreg
            key_path = f"Software\\Google\\Chrome\\NativeMessagingHosts\\{HOST_NAME}"
            winreg.DeleteKey(winreg.HKEY_CURRENT_USER, key_path)
            info(f"Removed registry key: HKCU\\{key_path}")
        except FileNotFoundError:
            info("No registry entry found")
        except Exception as e:
            warn(f"Could not remove registry key: {e}")

    # Remove macOS symlink
    elif SYSTEM == "Darwin":
        target = os.path.expanduser(
            f"~/Library/Application Support/Google/Chrome/NativeMessagingHosts/{HOST_NAME}.json"
        )
        if os.path.exists(target) or os.path.islink(target):
            os.remove(target)
            info(f"Removed: {target}")
        else:
            info("No macOS native host symlink found")

    # Remove Linux symlink
    else:
        target = os.path.expanduser(
            f"~/.config/google-chrome/NativeMessagingHosts/{HOST_NAME}.json"
        )
        if os.path.exists(target) or os.path.islink(target):
            os.remove(target)
            info(f"Removed: {target}")
        else:
            info("No Linux native host symlink found")

    # Remove .webrig directory
    if os.path.isdir(WEBRIG_DIR):
        shutil.rmtree(WEBRIG_DIR)
        info(f"Removed app data: {WEBRIG_DIR}")
    else:
        info("No app data directory found")

    # Remove all dist-* directories (profile-specific bundles)
    removed_any = False
    for d in glob.glob(os.path.join(SCRIPT_DIR, "dist-*")):
        if os.path.isdir(d):
            shutil.rmtree(d)
            info(f"Removed: {os.path.basename(d)}")
            removed_any = True
    if not removed_any:
        info("No previous profile bundles found")

    info("Cleanup complete")


# ── 2. Prerequisites ────────────────────────────────────────────

def check_prerequisites() -> bool:
    header("Checking prerequisites")
    ok = True

    node = which("node")
    if node:
        version = subprocess.check_output([node, "--version"], text=True).strip()
        info(f"Node.js: {version} ({node})")
    else:
        error("Node.js not found. Install from https://nodejs.org/")
        ok = False

    npm = which("npm")
    if npm:
        version = subprocess.check_output([npm, "--version"], text=True).strip()
        info(f"npm: {version} ({npm})")
    else:
        error("npm not found. It should come with Node.js.")
        ok = False

    info(f"Python: {sys.version.split()[0]} ({sys.executable})")

    try:
        subprocess.check_output(
            [sys.executable, "-m", "pip", "--version"],
            text=True, stderr=subprocess.DEVNULL,
        )
        info("pip: available")
    except (subprocess.CalledProcessError, FileNotFoundError):
        warn("pip not found. Python dependencies will need manual install.")

    if os.path.exists(HOST_SCRIPT):
        info(f"Native host script: {HOST_SCRIPT}")
    else:
        error(f"Native host script not found at: {HOST_SCRIPT}")
        ok = False

    return ok


# ── 3. Build extension ──────────────────────────────────────────

def build_extension() -> bool:
    header("Building extension")

    npm = which("npm")
    if not npm:
        error("npm not found. Cannot build.")
        return False

    info("Installing npm dependencies...")
    result = subprocess.run([npm, "install"], cwd=SCRIPT_DIR)
    if result.returncode != 0:
        error("npm install failed.")
        return False

    info("Building extension (vite + tsc)...")
    result = subprocess.run([npm, "run", "build"], cwd=SCRIPT_DIR)
    if result.returncode != 0:
        error("Extension build failed.")
        return False

    if os.path.isdir(DIST_DIR):
        info(f"Build output: {DIST_DIR}")
    else:
        error("dist/ directory not found after build.")
        return False

    return True


# ── 4. Python dependencies ──────────────────────────────────────

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


# ── 5. Chrome profile enumeration ───────────────────────────────

def chrome_user_data_dir() -> str:
    if SYSTEM == "Windows":
        return os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\User Data")
    elif SYSTEM == "Darwin":
        return os.path.expanduser("~/Library/Application Support/Google/Chrome")
    else:
        return os.path.expanduser("~/.config/google-chrome")


def enumerate_chrome_profiles() -> list[dict]:
    """Find all Chrome profiles and their display names.

    Returns list of dicts with keys: dir, name, path
    """
    chrome_dir = chrome_user_data_dir()
    profiles = []

    for prefs_path in glob.glob(os.path.join(chrome_dir, "*", "Preferences")):
        profile_dir = os.path.basename(os.path.dirname(prefs_path))

        # Skip non-profile directories
        if profile_dir in ("System Profile", "Guest Profile"):
            continue

        try:
            with open(prefs_path, "r", encoding="utf-8") as f:
                prefs = json.load(f)
        except (json.JSONDecodeError, OSError):
            continue

        name = prefs.get("profile", {}).get("name", profile_dir)
        acct = prefs.get("account_info", [])
        email = acct[0].get("email") if acct else None

        if name and email:
            display_name = f"{name} ({email})"
        elif name:
            display_name = name
        else:
            display_name = profile_dir

        profiles.append({
            "dir": profile_dir,
            "name": display_name,
            "path": os.path.dirname(prefs_path),
        })

    return sorted(profiles, key=lambda p: p["dir"])


def select_profiles(profiles: list[dict]) -> list[dict]:
    """Display numbered list of profiles and let user select."""
    header("Chrome profiles found")

    if not profiles:
        error("No Chrome profiles found!")
        sys.exit(1)

    print()
    for i, profile in enumerate(profiles, 1):
        print(f"  {i}. {profile['name']}  [{profile['dir']}]")
    print()

    selection = input("  Enter profile numbers to install (e.g. 1,3,4): ").strip()
    if not selection:
        error("No profiles selected. Aborting.")
        sys.exit(1)

    try:
        indices = [int(x.strip()) for x in selection.split(",")]
    except ValueError:
        error("Invalid input. Enter comma-separated numbers.")
        sys.exit(1)

    selected = []
    for idx in indices:
        if 1 <= idx <= len(profiles):
            selected.append(profiles[idx - 1])
        else:
            warn(f"Skipping invalid number: {idx}")

    if not selected:
        error("No valid profiles selected. Aborting.")
        sys.exit(1)

    print()
    info(f"Selected {len(selected)} profile(s):")
    for p in selected:
        info(f"  - {p['name']}")

    return selected


# ── 6. Per-profile extension setup ──────────────────────────────

def profile_slug(profile: dict) -> str:
    """Create a filesystem-safe slug from the profile directory name."""
    return profile["dir"].lower().replace(" ", "-")


def create_profile_bundle(profile: dict) -> str:
    """Copy dist/ to a profile-specific directory."""
    slug = profile_slug(profile)
    dest = os.path.join(SCRIPT_DIR, f"dist-{slug}")

    if os.path.exists(dest):
        shutil.rmtree(dest)

    shutil.copytree(DIST_DIR, dest)
    info(f"Created bundle: dist-{slug}/")
    return dest


def detect_extension_in_profile(profile: dict, expected_dist: str) -> str | None:
    """Detect our extension in a specific Chrome profile.

    Checks for extension whose path matches expected_dist or whose
    manifest name is "Claude (Headless)".

    Returns extension ID or None.
    """
    prefs_path = os.path.join(profile["path"], "Secure Preferences")

    try:
        with open(prefs_path, "r", encoding="utf-8") as f:
            prefs = json.load(f)
    except (json.JSONDecodeError, OSError):
        return None

    exts = prefs.get("extensions", {}).get("settings", {})
    expected_norm = os.path.normcase(os.path.normpath(expected_dist))

    for ext_id, ext_info in exts.items():
        ext_path = ext_info.get("path", "")
        if not ext_path:
            continue

        ext_path_norm = os.path.normcase(os.path.normpath(ext_path))

        # Match by exact path
        if ext_path_norm == expected_norm:
            return ext_id

        # Match by manifest name (fallback)
        if os.path.isdir(ext_path):
            manifest_path = os.path.join(ext_path, "manifest.json")
            try:
                with open(manifest_path, "r", encoding="utf-8") as f:
                    manifest = json.load(f)
                if manifest.get("name") == "Claude (Headless)":
                    return ext_id
            except (json.JSONDecodeError, OSError):
                pass

    return None


def poll_extension_in_profile(profile: dict, expected_dist: str, attempts: int = 6, interval: float = 2.0) -> str | None:
    """Poll Chrome's Secure Preferences for our extension, retrying with a delay."""
    import time
    for i in range(attempts):
        ext_id = detect_extension_in_profile(profile, expected_dist)
        if ext_id:
            return ext_id
        if i < attempts - 1:
            print(f"\r  Waiting for Chrome to flush prefs... ({i+1}/{attempts})", end="", flush=True)
            time.sleep(interval)
    print()  # newline after progress
    return None


def setup_profile(profile: dict) -> str | None:
    """Set up extension for a single profile.

    Creates a profile-specific bundle, guides the user to load it,
    then detects the extension ID (with polling + manual fallback).

    Returns extension ID if successful, None otherwise.
    """
    dist_path = create_profile_bundle(profile)

    print()
    print(f"  ┌──────────────────────────────────────────────────────")
    print(f"  │  Profile: {profile['name']}")
    print(f"  │")
    print(f"  │  1. Open Chrome with this profile")
    print(f"  │  2. Go to chrome://extensions")
    print(f"  │  3. Enable 'Developer mode' (top-right toggle)")
    print(f"  │  4. Click 'Load unpacked' and select:")
    print(f"  │     {dist_path}")
    print(f"  └──────────────────────────────────────────────────────")
    print()

    input("  Press Enter after loading the extension...")

    # Poll for detection (6 attempts, 2s apart = ~12s max)
    info(f"Detecting extension in profile: {profile['name']}...")
    ext_id = poll_extension_in_profile(profile, dist_path)

    if ext_id:
        info(f"Extension detected! ID: {ext_id}")
        return ext_id

    # Manual fallback
    warn("Auto-detection failed (Chrome may not have flushed prefs to disk).")
    print("  Copy the extension ID from chrome://extensions (shown under the extension name).")
    print()
    ext_id = input("  Paste extension ID (or press Enter to skip): ").strip()
    if not ext_id:
        warn(f"No ID entered, skipping profile: {profile['name']}")
        return None

    info(f"Extension ID: {ext_id}")
    return ext_id


# ── 7. Register native messaging host ───────────────────────────

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
    info(f"Allowed origins ({len(origins)}):")
    for origin in origins:
        info(f"  {origin}")

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

    skip_build = "--skip-build" in sys.argv

    # Step 1: Clean up previous installation
    cleanup_previous_install()

    # Step 2: Prerequisites
    if not check_prerequisites():
        error("Prerequisites check failed. Fix the issues above and retry.")
        sys.exit(1)

    # Step 3: Build extension
    if skip_build:
        info("Skipping build (--skip-build)")
        if not os.path.isdir(DIST_DIR):
            error("dist/ not found. Run without --skip-build first.")
            sys.exit(1)
    else:
        if not build_extension():
            sys.exit(1)

    # Step 4: Python dependencies
    if not install_python_deps():
        warn("Continuing without websockets — native host may fail at runtime.")

    # Step 5: Set up .webrig app data directory
    header("Setting up app data directory")
    os.makedirs(WEBRIG_DIR, exist_ok=True)
    info(f"App data directory: {WEBRIG_DIR}")

    # Step 6: Enumerate Chrome profiles and select
    profiles = enumerate_chrome_profiles()
    selected = select_profiles(profiles)

    # Step 7: Set up extension for each selected profile
    header("Setting up extension for each profile")

    extension_ids = []
    for i, profile in enumerate(selected, 1):
        print()
        info(f"Profile {i}/{len(selected)}: {profile['name']}")
        ext_id = setup_profile(profile)
        if ext_id:
            extension_ids.append(ext_id)
        else:
            warn(f"Skipped profile: {profile['name']}")

    if not extension_ids:
        error("No extension IDs detected. Cannot register native host.")
        sys.exit(1)

    # Step 8: Register native host with all detected IDs
    register_native_host(extension_ids)

    # Done — final summary
    header("Installation complete")
    print()
    print(f"  Registered {len(extension_ids)} extension(s):")
    for eid in extension_ids:
        print(f"    chrome-extension://{eid}/")
    print()
    print(f"  Profile bundles:")
    for p in selected:
        slug = profile_slug(p)
        print(f"    dist-{slug}/  ->  {p['name']}")
    print()
    print(f"  App data: {WEBRIG_DIR}")
    print()
    print("  Next steps:")
    print("    1. Restart Chrome (or reload the extensions)")
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

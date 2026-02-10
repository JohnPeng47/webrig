# WebRig

Browser automation bridge — connects AI agents to Chrome via WebSocket + native messaging.

## Architecture

```
External Agent (Claude, scripts, etc.)
    ↓ WebSocket (ws://localhost:7680)
WebSocket Server (ws_server.py)
    ↓ relays messages
Native Host (host.py) — launched by Chrome
    ↓ Chrome Native Messaging (stdin/stdout)
Chrome Extension (service worker)
    ↓ Chrome APIs
Browser Tabs
```

## Prerequisites

- **Node.js** (v18+) and npm
- **Python 3.10+** and pip
- **Google Chrome**

## Installation

### 1. Run the installer

```bash
cd webrig
python install.py
```

This will:
- Install npm dependencies and build the extension into `dist/`
- Install the `websockets` Python package
- Guide you through loading the extension in Chrome
- Auto-detect extension IDs across all Chrome profiles
- Register the native messaging host

### 2. Load the extension in Chrome

The installer will pause and prompt you to load the extension. For **each Chrome profile** you want to use:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the `dist/` folder
4. Press Enter in the installer to continue

The installer detects all profiles where the extension is loaded and registers them all.

### 3. Restart Chrome

After installation, restart Chrome (or reload the extension on `chrome://extensions`) for the native messaging host to connect.

### Installer options

```bash
python install.py              # full install (build + register)
python install.py --skip-build # re-register only, skip npm build
python install.py <ext-id>     # provide a specific extension ID manually
```

## Development

### Build

```bash
npm run build    # one-shot build
npm run dev      # watch mode
```

After building, reload the extension in `chrome://extensions`.

### Re-register after code changes

```bash
python install.py              # rebuild + re-register
python install.py --skip-build # re-register only
```

## Project structure

```
webrig/
├── src/
│   ├── service-worker/      # Extension background script
│   ├── content-scripts/     # Scripts injected into pages
│   ├── tools/               # 35+ browser automation tools
│   ├── shared/              # Constants, storage helpers
│   └── types/               # TypeScript type definitions
├── public/
│   └── manifest.json        # Chrome extension manifest (v3)
├── dist/                    # Built extension (load this in Chrome)
├── install.py               # Cross-platform installer
├── package.json
├── vite.config.ts
└── tsconfig.json

../native-host/              # Python relay (sibling directory)
├── host.py                  # Native messaging relay
├── host.bat                 # Windows wrapper (generated)
└── com.claude.browser_agent.json  # NM manifest (generated)

../ws_server.py              # WebSocket server (sibling)
```

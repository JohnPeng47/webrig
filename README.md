# WebRig

Browser automation bridge — connects AI agents to Chrome via WebSocket + native messaging.

## Install

Requires Node.js (v18+), Python 3.10+, and Google Chrome.

**1. Clone and build**

```bash
git clone https://github.com/JohnPeng47/webrig.git
cd webrig
python install.py
```

**2. Load the extension into Chrome**

The installer will pause and ask you to load the extension. For **every Chrome profile** you want to use:

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right)
3. **Load unpacked** → select the `dist/` folder

Repeat for each profile. Press Enter in the installer to continue.

**3. Confirm**

The installer scans Chrome and prints the profiles + extension IDs it found. Restart Chrome when done.

## How it works

```
Agent (Claude, scripts, etc.)
    ↓ WebSocket (ws://localhost:7680)
Native Host (host.py) ← auto-launched by Chrome via native messaging
    ↑ WebSocket (ws://localhost:7680)
Chrome Extension
    ↓ Chrome APIs
Browser
```

1. Extension loads and calls `chrome.runtime.connectNative()` — Chrome launches `native-host/host.py`
2. `host.py` starts a WebSocket server on `ws://localhost:7680`
3. Extension connects to the WebSocket server
4. Agent clients connect to the same server and send tool calls

## Project structure

```
webrig/
├── src/                        # TypeScript extension source
│   ├── service-worker/         # Background service worker
│   ├── tools/                  # 37+ browser automation tools
│   ├── content-scripts/        # Page-injected scripts
│   └── types/                  # Type definitions
├── native-host/
│   └── host.py                 # WebSocket server + native messaging host
├── dist/                       # Built extension (load this in Chrome)
├── install.py                  # One-step installer
└── public/
    └── manifest.json           # Chrome extension manifest
```

## App data

Runtime files are stored in a `.webrig` directory:

- **Windows:** `%LOCALAPPDATA%\.webrig`
- **Linux:** `~/.local/share/.webrig`
- **macOS:** `~/Library/Application Support/.webrig`

Contains the native messaging manifest, wrapper script, and server logs.

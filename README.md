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
Native Host (host.py) ← launched by Chrome
    ↓ Chrome Native Messaging
Chrome Extension
    ↓ Chrome APIs
Browser
```

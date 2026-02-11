#!/usr/bin/env python3
"""
WebRig Native Messaging Host + WebSocket Server.

When launched by Chrome via native messaging, this script:
  1. Starts a WebSocket server on port 7680
  2. Reads native messaging stdin to stay alive (Chrome kills the process if stdin closes)
  3. Routes messages between browser extensions (WS clients) and agent clients (WS clients)

Can also be run standalone:
    python host.py                    # start on default port 7680
    python host.py --port 8080        # custom port
    python host.py --log-dir /path    # custom log directory
"""

import asyncio
import json
import logging
import argparse
import os
import platform
import signal
import struct
import sys
import threading
from dataclasses import dataclass, field

import websockets

HOST = "127.0.0.1"
DEFAULT_PORT = 7680

logger = logging.getLogger("webrig")


# ── Native Messaging I/O (length-prefixed JSON over stdin/stdout) ──

def native_read():
    """Read one native messaging message from stdin. Returns None on EOF."""
    raw_len = sys.stdin.buffer.read(4)
    if not raw_len or len(raw_len) < 4:
        return None
    msg_len = struct.unpack("<I", raw_len)[0]
    raw_msg = sys.stdin.buffer.read(msg_len)
    if not raw_msg:
        return None
    return json.loads(raw_msg.decode("utf-8"))


def native_write(msg: dict):
    """Write one native messaging message to stdout."""
    data = json.dumps(msg).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(data)))
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()


def native_messaging_loop(shutdown_event: threading.Event):
    """
    Read from Chrome's native messaging stdin in a background thread.
    When stdin closes (Chrome killed the extension/port), signal shutdown.
    Responds to ping messages to confirm the host is alive.
    """
    try:
        while not shutdown_event.is_set():
            msg = native_read()
            if msg is None:
                # stdin closed — Chrome disconnected
                logger.info("Native messaging stdin closed, shutting down")
                break

            msg_type = msg.get("type", "")
            if msg_type == "ping":
                native_write({"type": "pong", "status": "running"})
            elif msg_type == "get_status":
                native_write({"type": "status", "ws_port": DEFAULT_PORT, "status": "running"})
            else:
                logger.debug(f"Native message ignored: {msg_type}")
    except Exception as e:
        logger.error(f"Native messaging loop error: {e}")
    finally:
        shutdown_event.set()


def is_native_messaging() -> bool:
    """Detect if we were launched by Chrome via native messaging (stdin is a pipe, not a terminal)."""
    return not sys.stdin.isatty()


# ── WebSocket Server ──────────────────────────────────────────────

@dataclass
class BrowserConnection:
    ws: object
    email: str
    tools: list[str] = field(default_factory=list)
    tool_schemas: list[dict] = field(default_factory=list)


class WebRigServer:
    def __init__(self, host: str, port: int):
        self.host = host
        self.port = port
        self.browsers: dict[str, BrowserConnection] = {}
        self.agents: set = set()
        self.unclassified: set = set()
        self.pending_requests: dict[str, object] = {}  # tool_use_id -> agent ws
        self.pending_list_tools: dict[str, object] = {}  # email -> agent ws
        self.pending_tab_groups: dict[str, asyncio.Future] = {}  # email -> Future

    async def handler(self, websocket):
        """Per-connection handler. Classifies the connection on first message."""
        self.unclassified.add(websocket)
        try:
            async for raw_message in websocket:
                try:
                    msg = json.loads(raw_message)
                except json.JSONDecodeError:
                    logger.warning("Non-JSON message received, ignoring")
                    continue
                await self.route_message(websocket, msg)
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            await self.cleanup(websocket)

    async def route_message(self, ws, msg: dict):
        msg_type = msg.get("type")

        # Browser identification: first message is extension_connected
        if msg_type == "extension_connected":
            self.unclassified.discard(ws)
            email = msg.get("email", "unknown")
            tools = msg.get("tools", [])
            tool_schemas = msg.get("tool_schemas", [])

            # If same email reconnects, close old connection
            old = self.browsers.get(email)
            if old and old.ws is not ws:
                logger.info(f"Browser reconnected: {email} (replacing old connection)")
                try:
                    await old.ws.close()
                except Exception:
                    pass

            self.browsers[email] = BrowserConnection(
                ws=ws, email=email, tools=tools, tool_schemas=tool_schemas,
            )
            logger.info(f"Browser connected: {email} ({len(tools)} tools)")
            return

        # Promote unclassified to agent on first non-browser message
        if ws in self.unclassified:
            self.unclassified.discard(ws)
            self.agents.add(ws)

        # Route based on connection type
        if ws in self.agents:
            await self.handle_agent_message(ws, msg)
        else:
            await self.handle_browser_message(ws, msg)

    # ── Agent message handling ────────────────────────────────────

    async def handle_agent_message(self, ws, msg: dict):
        msg_type = msg.get("type")

        if msg_type == "list_browsers":
            browsers_info = [
                {"email": email, "tools_count": len(bc.tools)}
                for email, bc in self.browsers.items()
            ]
            await ws.send(json.dumps({
                "type": "browsers_list",
                "browsers": browsers_info,
            }))

        elif msg_type == "list_tools":
            browser = self._resolve_browser(msg.get("browser"))
            if not browser:
                await ws.send(json.dumps(self._no_browser_error()))
                return
            resp = {
                "type": "tool_list",
                "tools": browser.tools,
                "tool_schemas": browser.tool_schemas,
                "browser": browser.email,
            }
            if len(self.browsers) > 1:
                resp["note"] = "Multiple browsers connected. Use --browser to target a specific one."
            await ws.send(json.dumps(resp))

        elif msg_type == "tool_call":
            browser = self._resolve_browser(msg.get("browser"))
            if not browser:
                tool_use_id = msg.get("tool_use_id", "")
                await ws.send(json.dumps({
                    "type": "tool_result",
                    "tool_use_id": tool_use_id,
                    "content": self._no_browser_error().get("message", "No browser"),
                    "is_error": True,
                }))
                return

            tool_use_id = msg.get("tool_use_id", "")
            self.pending_requests[tool_use_id] = ws

            forward = {k: v for k, v in msg.items() if k != "browser"}
            try:
                await browser.ws.send(json.dumps(forward))
            except Exception as e:
                self.pending_requests.pop(tool_use_id, None)
                await ws.send(json.dumps({
                    "type": "tool_result",
                    "tool_use_id": tool_use_id,
                    "content": f"Failed to send to browser: {e}",
                    "is_error": True,
                }))

        elif msg_type == "list_tab_groups":
            # Fan out to all connected browsers and aggregate results
            all_groups = []
            futures = {}
            loop = asyncio.get_event_loop()

            for email, bc in self.browsers.items():
                fut = loop.create_future()
                self.pending_tab_groups[email] = fut
                futures[email] = fut
                try:
                    await bc.ws.send(json.dumps({"type": "list_tab_groups"}))
                except Exception as e:
                    logger.warning(f"Failed to send list_tab_groups to {email}: {e}")
                    fut.set_result([])

            # Wait for all browsers to respond (5s timeout)
            for email, fut in futures.items():
                try:
                    groups = await asyncio.wait_for(fut, timeout=5)
                    for g in groups:
                        g["browser"] = email
                    all_groups.extend(groups)
                except asyncio.TimeoutError:
                    logger.warning(f"Timeout waiting for tab groups from {email}")
                finally:
                    self.pending_tab_groups.pop(email, None)

            await ws.send(json.dumps({
                "type": "tab_groups_list",
                "groups": all_groups,
            }))

        else:
            logger.warning(f"Unknown agent message type: {msg_type}")

    # ── Browser message handling ──────────────────────────────────

    async def handle_browser_message(self, ws, msg: dict):
        msg_type = msg.get("type")

        if msg_type == "tool_result":
            tool_use_id = msg.get("tool_use_id", "")
            agent_ws = self.pending_requests.pop(tool_use_id, None)
            if agent_ws:
                try:
                    await agent_ws.send(json.dumps(msg))
                except Exception:
                    pass

        elif msg_type == "tool_list":
            email = self._find_browser_email(ws)
            if email:
                agent_ws = self.pending_list_tools.pop(email, None)
                if agent_ws:
                    try:
                        await agent_ws.send(json.dumps(msg))
                    except Exception:
                        pass

        elif msg_type == "tab_groups_list":
            email = self._find_browser_email(ws)
            if email and email in self.pending_tab_groups:
                fut = self.pending_tab_groups[email]
                if not fut.done():
                    fut.set_result(msg.get("groups", []))

        elif msg_type == "pong":
            pass

        else:
            logger.warning(f"Unknown browser message type: {msg_type}")

    # ── Helpers ───────────────────────────────────────────────────

    def _resolve_browser(self, browser_hint: str | None):
        if not self.browsers:
            return None
        if browser_hint:
            return self.browsers.get(browser_hint)
        if len(self.browsers) == 1:
            return next(iter(self.browsers.values()))
        return None

    def _find_browser_email(self, ws) -> str | None:
        for email, bc in self.browsers.items():
            if bc.ws is ws:
                return email
        return None

    def _no_browser_error(self) -> dict:
        if not self.browsers:
            return {"type": "error", "message": "No browser connected"}
        return {
            "type": "error",
            "message": f"Multiple browsers connected ({', '.join(self.browsers.keys())}). Specify 'browser' field.",
        }

    async def cleanup(self, ws):
        self.unclassified.discard(ws)
        self.agents.discard(ws)

        emails_to_remove = [e for e, bc in self.browsers.items() if bc.ws is ws]
        for email in emails_to_remove:
            del self.browsers[email]
            logger.info(f"Browser disconnected: {email}")

            stale_requests = [
                (tid, agent_ws) for tid, agent_ws in self.pending_requests.items()
            ]
            for tid, agent_ws in stale_requests:
                try:
                    await agent_ws.send(json.dumps({
                        "type": "tool_result",
                        "tool_use_id": tid,
                        "content": f"Browser '{email}' disconnected",
                        "is_error": True,
                    }))
                except Exception:
                    pass
                self.pending_requests.pop(tid, None)

        if ws in self.agents or not emails_to_remove:
            stale = [k for k, v in self.pending_requests.items() if v is ws]
            for k in stale:
                del self.pending_requests[k]

    async def run(self, shutdown_event: threading.Event | None = None):
        async with websockets.serve(self.handler, self.host, self.port):
            logger.info(f"Listening on ws://{self.host}:{self.port}")
            if shutdown_event:
                # Poll the threading event so we stop when native messaging stdin closes
                while not shutdown_event.is_set():
                    await asyncio.sleep(1)
                logger.info("Shutdown event received, stopping server")
            else:
                await asyncio.Future()  # run forever


# ── App data directory ────────────────────────────────────────────

def get_webrig_dir() -> str:
    system = platform.system()
    if system == "Windows":
        base = os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))
        return os.path.join(base, ".webrig")
    elif system == "Darwin":
        return os.path.expanduser("~/Library/Application Support/.webrig")
    else:
        return os.path.expanduser("~/.local/share/.webrig")


# ── Entry point ───────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="WebRig WebSocket Server")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--host", default=HOST)
    parser.add_argument("--log-dir", default=None, help="Log directory (default: .webrig app data)")
    # Chrome passes the extension origin as a positional arg — ignore it
    args, _unknown = parser.parse_known_args()

    log_dir = args.log_dir or get_webrig_dir()
    os.makedirs(log_dir, exist_ok=True)

    log_file = os.path.join(log_dir, "server.log")
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[
            logging.StreamHandler(sys.stderr),  # stderr so it doesn't corrupt native messaging stdout
            logging.FileHandler(log_file),
        ],
    )

    native_mode = is_native_messaging()
    if native_mode:
        logger.info("Launched via Chrome native messaging")
        # Tell Chrome we're alive
        native_write({"type": "ready", "ws_port": args.port})
    else:
        logger.info("Running in standalone mode")

    logger.info(f"WebRig server starting (log dir: {log_dir})")

    server = WebRigServer(args.host, args.port)
    shutdown_event = threading.Event()

    if native_mode:
        # Run native messaging stdin reader in a background thread
        nm_thread = threading.Thread(target=native_messaging_loop, args=(shutdown_event,), daemon=True)
        nm_thread.start()

    # Graceful shutdown on SIGINT/SIGTERM
    loop = asyncio.new_event_loop()

    def shutdown():
        logger.info("Shutting down...")
        shutdown_event.set()
        for task in asyncio.all_tasks(loop):
            task.cancel()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, shutdown)
        except NotImplementedError:
            pass

    try:
        loop.run_until_complete(server.run(shutdown_event if native_mode else None))
    except (KeyboardInterrupt, asyncio.CancelledError):
        pass
    finally:
        loop.close()
        logger.info("Server stopped")


if __name__ == "__main__":
    main()

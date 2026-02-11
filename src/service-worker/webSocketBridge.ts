/**
 * WebSocket Bridge — connects to a local WebSocket server.
 *
 * No authentication. Any agent on the host can connect.
 * The extension is a WebSocket CLIENT that connects to a local server.
 */

import { toolRegistry } from '../tools/registry';
import { tabManager } from './tabManager';

const LOCAL_WS_URL = 'ws://localhost:7680';
const MAX_RECONNECT_ATTEMPTS = 100;
const BASE_DELAY_S = 1;
const BACKOFF_FACTOR = 1.3;
const MAX_DELAY_S = 10;
const LOG_PREFIX = '[WebSocketBridge]';

class WebSocketBridge {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  connect(): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return true;
    }

    this.closed = false;
    this.openSocket();
    return true;
  }

  sendMessage(msg: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn(`${LOG_PREFIX} Cannot send — socket not open`);
      return;
    }
    try {
      this.ws.send(JSON.stringify(msg));
    } catch (err) {
      console.error(`${LOG_PREFIX} Send failed:`, err);
    }
  }

  close(): void {
    this.closed = true;
    this.clearReconnectTimer();
    this.reconnectAttempts = 0;

    if (this.ws) {
      try {
        this.ws.close(1000, 'Client closing');
      } catch {
        // Socket may already be closed.
      }
      this.ws = null;
    }

    console.log(`${LOG_PREFIX} Closed`);
  }

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  // ── Private helpers ──────────────────────────────────────────────

  private openSocket(): void {
    try {
      const ws = new WebSocket(LOCAL_WS_URL);
      this.ws = ws;

      ws.addEventListener('open', () => {
        console.log(`${LOG_PREFIX} Connected to ${LOCAL_WS_URL}`);
        this.reconnectAttempts = 0;

        // Announce available tools to the server
        this.getProfileEmail().then((email) => {
          this.sendMessage({
            type: 'extension_connected',
            tools: toolRegistry.getAll().map((t) => t.name),
            tool_schemas: toolRegistry.getAllSchemas(),
            email: email || 'unknown',
          });
        });
      });

      ws.addEventListener('message', (event) => {
        this.handleRawMessage(event.data as string);
      });

      ws.addEventListener('close', (event) => {
        console.log(
          `${LOG_PREFIX} Closed (code=${event.code}, reason=${event.reason})`,
        );
        this.ws = null;
        this.scheduleReconnect();
      });

      ws.addEventListener('error', () => {
        // Error details are limited in browser context; the close event
        // will fire next and trigger reconnect.
      });
    } catch (err) {
      console.error(`${LOG_PREFIX} Failed to create WebSocket:`, err);
      this.scheduleReconnect();
    }
  }

  private async handleRawMessage(data: string): Promise<void> {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(data) as Record<string, unknown>;
    } catch {
      console.warn(`${LOG_PREFIX} Non-JSON message received`);
      return;
    }

    const type = message['type'] as string;

    switch (type) {
      case 'tool_call':
        await this.handleToolCall(message);
        break;

      case 'ping':
        this.sendMessage({ type: 'pong' });
        break;

      case 'list_tools':
        this.sendMessage({
          type: 'tool_list',
          tools: toolRegistry.getAll().map((t) => t.name),
          tool_schemas: toolRegistry.getAllSchemas(),
        });
        break;

      case 'list_tab_groups':
        await this.handleListTabGroups();
        break;

      default:
        console.warn(`${LOG_PREFIX} Unknown message type: ${type}`);
        break;
    }
  }

  private async handleToolCall(msg: Record<string, unknown>): Promise<void> {
    const toolName = (msg['tool'] ?? msg['toolName'] ?? msg['tool_name']) as string;
    const args = (msg['args'] ?? msg['input'] ?? {}) as Record<string, unknown>;
    const toolUseId = (msg['tool_use_id'] ?? msg['id'] ?? crypto.randomUUID()) as string;
    let tabId = msg['tab_id'] as number | undefined;

    // Auto-detect active tab if none specified
    if (tabId === undefined || tabId === null || tabId === 0) {
      tabId = await this.resolveActiveTab();
      console.log(`${LOG_PREFIX} Resolved active tab: ${tabId}`);
    }

    console.log(`${LOG_PREFIX} Tool call: ${toolName} (tab=${tabId ?? -1})`, args);

    try {
      const result = await toolRegistry.executeTool({
        toolName,
        args,
        tabId,
        source: 'bridge',
        toolUseId,
      });

      this.sendMessage({
        type: 'tool_result',
        tool_use_id: toolUseId,
        tool_name: toolName,
        content: result.content,
        is_error: result.is_error ?? false,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.sendMessage({
        type: 'tool_result',
        tool_use_id: toolUseId,
        tool_name: toolName,
        content: errorMessage,
        is_error: true,
      });
    }
  }

  private async handleListTabGroups(): Promise<void> {
    try {
      const groups = await tabManager.getGroups();
      this.sendMessage({
        type: 'tab_groups_list',
        groups,
      });
    } catch (err) {
      this.sendMessage({
        type: 'tab_groups_list',
        groups: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Profile identification ──────────────────────────────────────

  private getProfileEmail(): Promise<string | null> {
    return new Promise((resolve) => {
      try {
        chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' as chrome.identity.AccountStatus }, (userInfo) => {
          resolve(userInfo?.email || null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  // ── Tab resolution ──────────────────────────────────────────────

  private async resolveActiveTab(): Promise<number | undefined> {
    // Strategy 1: active tab in the last focused window (skip chrome:// pages)
    try {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const tab = tabs.find(
        (t) => t.id !== undefined && t.id !== chrome.tabs.TAB_ID_NONE && !t.url?.startsWith('chrome://'),
      );
      if (tab?.id) return tab.id;
    } catch { /* continue to next strategy */ }

    // Strategy 2: active tab in any window
    try {
      const tabs = await chrome.tabs.query({ active: true });
      const tab = tabs.find(
        (t) => t.id !== undefined && t.id !== chrome.tabs.TAB_ID_NONE && !t.url?.startsWith('chrome://'),
      );
      if (tab?.id) return tab.id;
    } catch { /* continue to next strategy */ }

    // Strategy 3: most recently accessed non-chrome tab
    try {
      const tabs = await chrome.tabs.query({});
      const valid = tabs
        .filter((t) => t.id !== undefined && t.id !== chrome.tabs.TAB_ID_NONE && !t.url?.startsWith('chrome://'))
        .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
      if (valid[0]?.id) return valid[0].id;
    } catch { /* give up */ }

    return undefined;
  }

  // ── Reconnection with exponential backoff ────────────────────────

  private scheduleReconnect(): void {
    if (this.closed) {
      return;
    }

    this.reconnectAttempts += 1;

    if (this.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      console.error(
        `${LOG_PREFIX} Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) exceeded — giving up`,
      );
      return;
    }

    const delaySec = Math.min(
      BASE_DELAY_S * Math.pow(BACKOFF_FACTOR, this.reconnectAttempts - 1),
      MAX_DELAY_S,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delaySec * 1000);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

export const webSocketBridge = new WebSocketBridge();

export function initWebSocketBridge(): void {
  webSocketBridge.connect();
  console.log(`${LOG_PREFIX} Bridge initialised (connecting to ${LOCAL_WS_URL})`);
}

export function reinitWebSocketBridge(): void {
  webSocketBridge.close();
  initWebSocketBridge();
}

export function closeWebSocketBridge(): void {
  webSocketBridge.close();
}

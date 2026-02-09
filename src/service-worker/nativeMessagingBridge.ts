/**
 * Native Messaging Bridge — connects to a local native messaging host.
 *
 * Uses chrome.runtime.connectNative() to communicate with a Python relay
 * that also exposes a WebSocket server for agent clients.
 */

import { toolRegistry } from '../tools/registry';

const NATIVE_HOST_NAME = 'com.claude.browser_agent';
const LOG_PREFIX = '[NativeMessagingBridge]';
const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 50;

class NativeMessagingBridge {
  private port: chrome.runtime.Port | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  connect(): void {
    if (this.port) {
      return;
    }

    this.closed = false;
    this.openPort();
  }

  sendMessage(msg: Record<string, unknown>): void {
    if (!this.port) {
      console.warn(`${LOG_PREFIX} Cannot send — port not open`);
      return;
    }
    try {
      this.port.postMessage(msg);
    } catch (err) {
      console.error(`${LOG_PREFIX} Send failed:`, err);
    }
  }

  close(): void {
    this.closed = true;
    this.clearReconnectTimer();
    this.reconnectAttempts = 0;

    if (this.port) {
      try {
        this.port.disconnect();
      } catch {
        // Port may already be disconnected.
      }
      this.port = null;
    }

    console.log(`${LOG_PREFIX} Closed`);
  }

  get isConnected(): boolean {
    return this.port !== null;
  }

  // ── Private helpers ──────────────────────────────────────────────

  private openPort(): void {
    try {
      const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
      this.port = port;

      port.onMessage.addListener((msg: Record<string, unknown>) => {
        this.handleMessage(msg);
      });

      port.onDisconnect.addListener(() => {
        const error = chrome.runtime.lastError;
        if (error) {
          console.warn(`${LOG_PREFIX} Disconnected:`, error.message);
        } else {
          console.log(`${LOG_PREFIX} Disconnected`);
        }
        this.port = null;
        this.scheduleReconnect();
      });

      console.log(`${LOG_PREFIX} Connected to native host "${NATIVE_HOST_NAME}"`);
      this.reconnectAttempts = 0;

      // Get Chrome profile email for multi-browser identification
      this.getProfileEmail().then((email) => {
        this.sendMessage({
          type: 'extension_connected',
          tools: toolRegistry.getAll().map((t) => t.name),
          tool_schemas: toolRegistry.getAllSchemas(),
          email: email || 'unknown',
        });
      });
    } catch (err) {
      console.error(`${LOG_PREFIX} Failed to connect:`, err);
      this.port = null;
      this.scheduleReconnect();
    }
  }

  private handleMessage(message: Record<string, unknown>): void {
    const type = message['type'] as string;

    switch (type) {
      case 'tool_call':
        void this.handleToolCall(message);
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

  // ── Reconnection ─────────────────────────────────────────────────

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

    console.log(
      `${LOG_PREFIX} Reconnecting in ${RECONNECT_DELAY_MS}ms (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, RECONNECT_DELAY_MS);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

export const nativeMessagingBridge = new NativeMessagingBridge();

export function initNativeMessagingBridge(): void {
  nativeMessagingBridge.connect();
  console.log(`${LOG_PREFIX} Bridge initialised`);
}

export function reinitNativeMessagingBridge(): void {
  nativeMessagingBridge.close();
  initNativeMessagingBridge();
}

export function closeNativeMessagingBridge(): void {
  nativeMessagingBridge.close();
}

/**
 * Claude Browser Extension — Headless Service Worker Entry Point
 *
 * No UI, no auth. Connects directly to a local WebSocket server
 * for agent communication.
 */

console.log('[ServiceWorker] Claude extension (headless) loaded');

// ── Tools (register all tool definitions) ────────────────────────
import '../tools/index';

// ── User-Agent rule for API requests ─────────────────────────────
import { setupUserAgentRule } from './userAgentRule';

// ── Native Messaging Bridge (launches host.py) ─────────────────
import {
  nativeMessagingBridge,
  initNativeMessagingBridge,
} from './nativeMessagingBridge';

// ── WebSocket Bridge (connects to host.py's WS server) ─────────
import {
  webSocketBridge,
  initWebSocketBridge,
  closeWebSocketBridge,
  reinitWebSocketBridge,
} from './webSocketBridge';

// ── Tab Manager ──────────────────────────────────────────────────
import { tabManager } from './tabManager';

// ── Scheduled Tasks + Alarms ─────────────────────────────────────
import { setupAlarmListener, registerAllAlarms } from './alarms';

// ── Deep Links ───────────────────────────────────────────────────
import { setupDeepLinks } from './deepLinks';

// ── Message Router ───────────────────────────────────────────────
import { setupMessageRouter } from './messageRouter';

// ── Lifecycle: Install ───────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[ServiceWorker] Installed:', details.reason);

  setupMessageRouter();
  setupAlarmListener();
  await setupUserAgentRule();

  setupDeepLinks(async () => {
    closeWebSocketBridge();
    initWebSocketBridge();
  });

  tabManager.initialize();

  // Launch host.py via native messaging, then connect over WebSocket
  initNativeMessagingBridge();
  setTimeout(() => initWebSocketBridge(), 1000);

  await registerAllAlarms();
});

// ── Lifecycle: Startup ───────────────────────────────────────────

chrome.runtime.onStartup.addListener(async () => {
  console.log('[ServiceWorker] Startup');

  setupMessageRouter();
  setupAlarmListener();
  await setupUserAgentRule();

  setupDeepLinks(async () => {
    closeWebSocketBridge();
    initWebSocketBridge();
  });

  tabManager.initialize();

  // Launch host.py via native messaging, then connect over WebSocket
  initNativeMessagingBridge();
  setTimeout(() => initWebSocketBridge(), 1000);

  await registerAllAlarms();
});

// ── Action click (headless: just log) ────────────────────────────

chrome.action.onClicked.addListener(async (tab) => {
  console.log('[ServiceWorker] Action clicked on tab:', tab.id);
});

// ── Keyboard shortcut ────────────────────────────────────────────

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-side-panel') {
    console.log('[ServiceWorker] Keyboard shortcut triggered');
  }
});

// ── Update available ─────────────────────────────────────────────

chrome.runtime.onUpdateAvailable.addListener((details) => {
  console.log('[ServiceWorker] Update available:', details.version);
  chrome.storage.local.set({ updateAvailable: details.version });
});

// ── Tab removal listener ─────────────────────────────────────────

chrome.tabs.onRemoved.addListener((tabId) => {
  void tabManager.handleTabClosed(tabId);
});


// ── Ensure imports are retained ──────────────────────────────────
void nativeMessagingBridge;
void webSocketBridge;
void tabManager;
void closeWebSocketBridge;
void reinitWebSocketBridge;

export {};

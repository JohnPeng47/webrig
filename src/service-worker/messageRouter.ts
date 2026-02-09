/**
 * Message Router — dispatches chrome.runtime.onMessage messages.
 *
 * Headless build: no auth, no native messaging.
 */

import { closeNativeMessagingBridge, reinitNativeMessagingBridge } from './nativeMessagingBridge';

const LOG_PREFIX = '[MessageRouter]';

export function setupMessageRouter(): void {
  chrome.runtime.onMessage.addListener(
    (
      message: { type: string; [key: string]: unknown },
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response: unknown) => void,
    ) => {
      switch (message.type) {
        case 'STOP_AGENT':
          console.log(`${LOG_PREFIX} Stop agent requested`);
          sendResponse({ success: true });
          break;

        case 'RECONNECT_BRIDGE':
          void (async () => {
            closeNativeMessagingBridge();
            reinitNativeMessagingBridge();
            sendResponse({ success: true });
          })();
          return true;

        case 'SWITCH_TO_MAIN_TAB':
          sendResponse({ success: true });
          break;

        case 'STATIC_INDICATOR_HEARTBEAT':
          sendResponse({ success: true });
          break;

        case 'DISMISS_STATIC_INDICATOR_FOR_GROUP':
          sendResponse({ success: true });
          break;

        case 'CONFIRM_EXTENSION_RELOAD':
          console.log(`${LOG_PREFIX} User confirmed extension reload`);
          sendResponse({ success: true });
          setTimeout(() => chrome.runtime.reload(), 100);
          return true;

        default:
          console.log(`${LOG_PREFIX} Unhandled message type: ${message.type}`);
          sendResponse({ success: false, error: 'Unknown message type' });
          break;
      }

      return true;
    },
  );

  console.log(`${LOG_PREFIX} Message router registered`);
}

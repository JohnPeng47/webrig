/**
 * Deep Links — intercepts clau.de/chrome/* URLs.
 *
 * - clau.de/chrome/reconnect -> disconnect + reconnect both channels
 * - clau.de/chrome/tab/{id}  -> focus/activate tab
 */

const LOG_PREFIX = '[DeepLinks]';
const DEEP_LINK_PATTERN = /^https?:\/\/clau\.de\/chrome\//;

/**
 * Setup deep link interception via webNavigation.
 */
export function setupDeepLinks(
  reconnectChannels: () => Promise<void>,
): void {
  chrome.webNavigation.onBeforeNavigate.addListener(
    (details) => {
      if (!DEEP_LINK_PATTERN.test(details.url)) return;

      const url = new URL(details.url);
      const path = url.pathname.replace(/^\/chrome\//, '');

      console.log(`${LOG_PREFIX} Intercepted deep link: ${path}`);

      // Close the intercepted tab
      if (details.tabId) {
        chrome.tabs.remove(details.tabId).catch(() => {
          // Tab may already be gone
        });
      }

      // Route
      if (path === 'reconnect') {
        console.log(`${LOG_PREFIX} Reconnecting channels...`);
        void reconnectChannels();
      } else if (path.startsWith('tab/')) {
        const tabIdStr = path.replace('tab/', '');
        const tabId = parseInt(tabIdStr, 10);
        if (!isNaN(tabId)) {
          chrome.tabs.update(tabId, { active: true }).catch((err) => {
            console.warn(`${LOG_PREFIX} Failed to activate tab ${tabId}:`, err);
          });
          chrome.tabs.get(tabId).then((tab) => {
            if (tab.windowId) {
              chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
            }
          }).catch(() => {});
        }
      } else {
        console.warn(`${LOG_PREFIX} Unknown deep link path: ${path}`);
      }
    },
    { url: [{ hostEquals: 'clau.de' }] },
  );

  console.log(`${LOG_PREFIX} Deep link listener registered`);
}

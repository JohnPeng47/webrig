// Sets up a declarativeNetRequest session rule that overrides the
// User-Agent header on outgoing requests to api.anthropic.com so
// the server can identify traffic from the browser extension.

/**
 * Register (or update) a session-scoped declarativeNetRequest rule that
 * appends the extension version and platform to the User-Agent header for
 * all XHR / fetch requests made to the Anthropic API.
 */
export async function setupUserAgentRule(): Promise<void> {
  const manifest = chrome.runtime.getManifest();
  const version = manifest.version;
  const userAgent = `claude-browser-extension/${version} (external) ${navigator.userAgent}`;

  const RULE_ID = 1;

  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [RULE_ID],
      addRules: [
        {
          id: RULE_ID,
          priority: 1,
          action: {
            type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
            requestHeaders: [
              {
                header: 'User-Agent',
                operation: chrome.declarativeNetRequest.HeaderOperation.SET,
                value: userAgent,
              },
            ],
          },
          condition: {
            urlFilter: 'https://api.anthropic.com/*',
            resourceTypes: [
              chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
              chrome.declarativeNetRequest.ResourceType.OTHER,
            ],
          },
        },
      ],
    });

    console.log(
      '[UserAgentRule] Session rule registered. User-Agent:',
      userAgent,
    );
  } catch (err: unknown) {
    console.error('[UserAgentRule] Failed to register session rule:', err);
  }
}

/**
 * Shared constants — URLs, OAuth config, and extension metadata.
 */

export const ENV = {
  apiBaseUrl: 'https://api.anthropic.com',
  wsApiBaseUrl: 'wss://api.anthropic.com',
} as const;

function getRedirectUri(): string {
  if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
    return `https://${chrome.runtime.id}.chromiumapp.org/oauth/callback`;
  }
  return 'https://extension-id.chromiumapp.org/oauth/callback';
}

export const OAUTH = {
  AUTHORIZE_URL: 'https://console.anthropic.com/oauth/authorize',
  TOKEN_URL: 'https://console.anthropic.com/v1/oauth/token',
  SCOPES: 'user:inference user:profile',
  CLIENT_ID: 'claude-browser-extension',
  get REDIRECT_URI(): string {
    return getRedirectUri();
  },
  REFRESH_THRESHOLD_MS: 5 * 60 * 1000,
} as const;

export const EXTENSION = {
  NAME: 'Claude (Headless)',
  DESCRIPTION: 'Claude browser extension — headless MCP automation core',
  NATIVE_HOST_NAME: 'com.anthropic.claude_browser_extension',
  KEEPALIVE_INTERVAL_MS: 25_000,
  REQUEST_TIMEOUT_MS: 120_000,
  MAX_HISTORY_TURNS: 200,
} as const;

export const API = {
  VERSION: '2023-06-01',
  DEFAULT_MODEL: 'claude-sonnet-4-20250514',
  DEFAULT_MAX_TOKENS: 16_384,
  MESSAGES_PATH: '/v1/messages',
  SESSIONS_PATH: '/v1/sessions',
} as const;

export const CONTENT_SCRIPT = {
  INDICATOR_CLASS: 'claude-agent-indicator',
  ACTIVE_ELEMENT_ATTR: 'data-claude-active',
} as const;

export const UNINSTALL_SURVEY_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSdLa1wTVkB2ml2abPI1FP9KiboOnp2N0c3aDmp5rWmaOybWwQ/viewform';

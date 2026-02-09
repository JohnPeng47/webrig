/**
 * StorageKey enum — every key used in chrome.storage.local.
 *
 * Reduced set: permission-related keys removed for headless build.
 */
export enum StorageKey {
  // ── Model / Prompt Configuration ────────────────────────────────
  SELECTED_MODEL = 'selectedModel',
  SYSTEM_PROMPT = 'systemPrompt',
  PURL_CONFIG = 'purlConfig',

  // ── Debug & Feature Flags ───────────────────────────────────────
  DEBUG_MODE = 'debugMode',
  MODEL_SELECTOR_DEBUG = 'modelSelectorDebug',
  SHOW_TRACE_IDS = 'showTraceIds',
  SHOW_SYSTEM_REMINDERS = 'showSystemReminders',
  USE_SESSIONS_API = 'useSessionsAPI',
  SESSIONS_API_HOSTNAME = 'sessionsApiHostname',

  // ── Analytics / Identity ────────────────────────────────────────
  ANONYMOUS_ID = 'anonymousId',

  // ── Testing ─────────────────────────────────────────────────────
  TEST_DATA_MESSAGES = 'test_data_messages',

  // ── Scheduled Tasks ─────────────────────────────────────────────
  SCHEDULED_TASK_LOGS = 'scheduledTaskLogs',
  SCHEDULED_TASK_STATS = 'scheduledTaskStats',
  PENDING_SCHEDULED_TASK = 'pendingScheduledTask',

  // ── Tab / Window Management ─────────────────────────────────────
  TARGET_TAB_ID = 'targetTabId',

  // ── Updates ──────────────────────────────────────────────────────
  UPDATE_AVAILABLE = 'updateAvailable',

  // ── Notifications ───────────────────────────────────────────────
  NOTIFICATIONS_ENABLED = 'notificationsEnabled',

  // ── Saved Prompts ───────────────────────────────────────────────
  SAVED_PROMPTS = 'savedPrompts',
  SAVED_PROMPT_CATEGORIES = 'savedPromptCategories',

  // ── Tab Groups ──────────────────────────────────────────────────
  TAB_GROUPS = 'tabGroups',
  DISMISSED_TAB_GROUPS = 'dismissedTabGroups',

  // ── MCP (Model Context Protocol) ────────────────────────────────
  MCP_TAB_GROUP_ID = 'mcpTabGroupId',
  MCP_CONNECTED = 'mcpConnected',

  // ── WebSocket Bridge ─────────────────────────────────────────────
  BRIDGE_PEER_CONNECTED = 'bridgePeerConnected',
}

/**
 * Mapping from StorageKey to the TypeScript type stored under that key.
 */
export interface StorageKeyTypeMap {
  [StorageKey.SELECTED_MODEL]: string;
  [StorageKey.SYSTEM_PROMPT]: string;
  [StorageKey.PURL_CONFIG]: Record<string, unknown>;
  [StorageKey.DEBUG_MODE]: boolean;
  [StorageKey.MODEL_SELECTOR_DEBUG]: boolean;
  [StorageKey.SHOW_TRACE_IDS]: boolean;
  [StorageKey.SHOW_SYSTEM_REMINDERS]: boolean;
  [StorageKey.USE_SESSIONS_API]: boolean;
  [StorageKey.SESSIONS_API_HOSTNAME]: string;
  [StorageKey.ANONYMOUS_ID]: string;
  [StorageKey.TEST_DATA_MESSAGES]: unknown[];
  [StorageKey.SCHEDULED_TASK_LOGS]: unknown[];
  [StorageKey.SCHEDULED_TASK_STATS]: Record<string, unknown>;
  [StorageKey.PENDING_SCHEDULED_TASK]: Record<string, unknown> | null;
  [StorageKey.TARGET_TAB_ID]: number;
  [StorageKey.UPDATE_AVAILABLE]: string | null;
  [StorageKey.NOTIFICATIONS_ENABLED]: boolean;
  [StorageKey.SAVED_PROMPTS]: unknown[];
  [StorageKey.SAVED_PROMPT_CATEGORIES]: string[];
  [StorageKey.TAB_GROUPS]: Record<string, unknown>;
  [StorageKey.DISMISSED_TAB_GROUPS]: string[];
  [StorageKey.MCP_TAB_GROUP_ID]: number;
  [StorageKey.MCP_CONNECTED]: boolean;
  [StorageKey.BRIDGE_PEER_CONNECTED]: boolean;
}

/**
 * IPC message types — discriminated union of messages exchanged
 * between service worker, content scripts, etc.
 *
 * Headless build: UI-specific messages removed, permission references dropped.
 */

// ── Scheduled task descriptor ─────────────────────────────────────
export interface ScheduledTaskDescriptor {
  id: string;
  name: string;
  prompt: string;
  schedule: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  [key: string]: unknown;
}

// ── Individual message interfaces ─────────────────────────────────

export interface ExecuteTaskMessage {
  type: 'EXECUTE_TASK';
  prompt: string;
  taskName?: string;
  runLogId?: string;
  windowSessionId?: string;
  isScheduledTask?: boolean;
}

export interface StopAgentMessage {
  type: 'STOP_AGENT';
  fromTabId?: number;
  targetTabId?: number;
}

export interface LogoutMessage {
  type: 'logout';
}

export interface CheckNativeHostStatusMessage {
  type: 'check_native_host_status';
}

export interface SendMcpNotificationMessage {
  type: 'SEND_MCP_NOTIFICATION';
  method: string;
  params: Record<string, unknown>;
}

export interface ExecuteScheduledTaskMessage {
  type: 'EXECUTE_SCHEDULED_TASK';
  task: ScheduledTaskDescriptor;
  runLogId: string;
  isManual?: boolean;
}

export interface PlayNotificationSoundMessage {
  type: 'PLAY_NOTIFICATION_SOUND';
  audioUrl: string;
  volume?: number;
}

export interface SwitchToMainTabMessage {
  type: 'SWITCH_TO_MAIN_TAB';
}

export interface SecondaryTabCheckMainMessage {
  type: 'SECONDARY_TAB_CHECK_MAIN';
  secondaryTabId: number;
  mainTabId: number;
  timestamp: number;
}

export interface MainTabAckRequestMessage {
  type: 'MAIN_TAB_ACK_REQUEST';
  secondaryTabId: number;
  mainTabId: number;
  timestamp: number;
}

export interface MainTabAckResponseMessage {
  type: 'MAIN_TAB_ACK_RESPONSE';
  success: boolean;
}

export interface StaticIndicatorHeartbeatMessage {
  type: 'STATIC_INDICATOR_HEARTBEAT';
}

export interface DismissStaticIndicatorForGroupMessage {
  type: 'DISMISS_STATIC_INDICATOR_FOR_GROUP';
}

export interface ShowAgentIndicatorsMessage {
  type: 'SHOW_AGENT_INDICATORS';
}

export interface HideAgentIndicatorsMessage {
  type: 'HIDE_AGENT_INDICATORS';
}

export interface HideForToolUseMessage {
  type: 'HIDE_FOR_TOOL_USE';
}

export interface ShowAfterToolUseMessage {
  type: 'SHOW_AFTER_TOOL_USE';
}

export interface ShowStaticIndicatorMessage {
  type: 'SHOW_STATIC_INDICATOR';
}

export interface HideStaticIndicatorMessage {
  type: 'HIDE_STATIC_INDICATOR';
}

// ── Discriminated union ───────────────────────────────────────────

export type ExtensionMessage =
  | ExecuteTaskMessage
  | StopAgentMessage
  | LogoutMessage
  | CheckNativeHostStatusMessage
  | SendMcpNotificationMessage
  | ExecuteScheduledTaskMessage
  | PlayNotificationSoundMessage
  | SwitchToMainTabMessage
  | SecondaryTabCheckMainMessage
  | MainTabAckRequestMessage
  | MainTabAckResponseMessage
  | StaticIndicatorHeartbeatMessage
  | DismissStaticIndicatorForGroupMessage
  | ShowAgentIndicatorsMessage
  | HideAgentIndicatorsMessage
  | HideForToolUseMessage
  | ShowAfterToolUseMessage
  | ShowStaticIndicatorMessage
  | HideStaticIndicatorMessage;

export type MessageOfType<T extends ExtensionMessage['type']> = Extract<
  ExtensionMessage,
  { type: T }
>;

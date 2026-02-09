/**
 * Native messaging protocol types — messages exchanged between the
 * Chrome extension and the native-messaging host binary.
 */

// ── Shared sub-types ──────────────────────────────────────────────

export interface NativeToolRequestParams {
  tool: string;
  args: Record<string, unknown>;
  client_id: string;
  tabGroupId?: number;
  tabId?: number;
}

export interface NativeToolResultContent {
  content: Array<{
    type: string;
    text?: string;
    data?: string;
    media_type?: string;
  }>;
}

// ── Outgoing messages (extension -> native host) ──────────────────

export interface NativeMessageToolRequest {
  type: 'tool_request';
  method: 'execute_tool';
  params: NativeToolRequestParams;
}

export interface NativeMessageGetStatus {
  type: 'get_status';
}

export interface NativeMessagePing {
  type: 'ping';
}

export interface NativeMessageNotification {
  type: 'notification';
  jsonrpc: '2.0';
  method: string;
  params: Record<string, unknown>;
}

export type NativeMessageOutgoing =
  | NativeMessageToolRequest
  | NativeMessageGetStatus
  | NativeMessagePing
  | NativeMessageNotification;

// ── Incoming messages (native host -> extension) ──────────────────

export interface NativeMessageStatusResponse {
  type: 'status_response';
  nativeHostInstalled: boolean;
  mcpConnected: boolean;
}

export interface NativeMessageMcpConnected {
  type: 'mcp_connected';
}

export interface NativeMessageMcpDisconnected {
  type: 'mcp_disconnected';
}

export interface NativeMessagePong {
  type: 'pong';
}

export interface NativeMessageToolResponse {
  type: 'tool_response';
  result?: NativeToolResultContent;
  error?: NativeToolResultContent;
}

export type NativeMessageIncoming =
  | NativeMessageStatusResponse
  | NativeMessageMcpConnected
  | NativeMessageMcpDisconnected
  | NativeMessagePong
  | NativeMessageToolResponse;

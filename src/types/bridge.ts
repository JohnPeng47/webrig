/**
 * WebSocket bridge types — messages exchanged between the extension
 * and a remote peer over the WebSocket relay.
 */

// ── Outgoing messages (extension -> bridge server) ────────────────

export interface BridgeToolCall {
  type: 'tool_call';
  tool_use_id: string;
  tool: string;
  args: Record<string, unknown>;
  target_device_id?: string;
  client_type?: string;
}

export interface BridgePairingRequest {
  type: 'pairing_request';
  request_id: string;
  client_type: string;
}

export interface BridgePermissionResponse {
  type: 'permission_response';
  request_id: string;
  allowed: boolean;
}

export interface BridgePing {
  type: 'ping';
}

export interface BridgeNotification {
  type: 'notification';
  method: string;
  params: Record<string, unknown>;
}

export type BridgeMessageOutgoing =
  | BridgeToolCall
  | BridgePairingRequest
  | BridgePermissionResponse
  | BridgePing
  | BridgeNotification;

// ── Incoming messages (bridge server -> extension) ────────────────

export interface BridgePeerConnected {
  type: 'peer_connected';
}

export interface BridgePeerDisconnected {
  type: 'peer_disconnected';
}

export interface BridgeToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content?: string | Array<{ type: string; text?: string; data?: string; media_type?: string }>;
  is_error?: boolean;
  error?: string;
}

export interface BridgePairingResponse {
  type: 'pairing_response';
  request_id: string;
  device_id: string;
  name: string;
}

export interface BridgePermissionRequest {
  type: 'permission_request';
  tool_use_id: string;
  request_id: string;
  tool_type: string;
  url?: string;
  action_data?: Record<string, unknown>;
}

export interface BridgePong {
  type: 'pong';
}

export type BridgeMessageIncoming =
  | BridgePeerConnected
  | BridgePeerDisconnected
  | BridgeToolResult
  | BridgePairingResponse
  | BridgePermissionRequest
  | BridgePong;

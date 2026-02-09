/**
 * Tool types — interfaces for browser-automation tools.
 *
 * Headless build: permissionMode/allowedDomains retained in context
 * for type compatibility but never enforced.
 */

// ── Execution context ─────────────────────────────────────────────

export interface ToolExecutionContext {
  toolUseId: string;
  tabId: number;
  tabGroupId?: number;
  clientId?: string;
  source: 'bridge';
}

// ── Tool result ───────────────────────────────────────────────────

export interface ToolResultContentBlock {
  type: string;
  text?: string;
  data?: string;
  media_type?: string;
}

export interface ToolResult {
  content: string | ToolResultContentBlock[];
  is_error?: boolean;
}

// ── Tool parameter schema ─────────────────────────────────────────

export interface ToolParameterDefinition {
  type: string;
  description: string;
  required?: boolean;
  enum?: string[];
  default?: unknown;
  items?: { type: string };
}

// ── Tool definition ───────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ToolParameterDefinition>;
  execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult>;
  toAnthropicSchema(): AnthropicToolSchema;
}

// ── Anthropic API tool schema ─────────────────────────────────────

export interface AnthropicToolSchema {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<
      string,
      {
        type: string;
        description: string;
        enum?: string[];
      }
    >;
    required: string[];
  };
}

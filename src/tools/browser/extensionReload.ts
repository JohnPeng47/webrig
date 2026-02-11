/**
 * extension_reload — Reload the extension from disk.
 *
 * Broadcasts a toast notification to all open tabs, waits briefly,
 * then calls chrome.runtime.reload(). The WebSocket connection
 * will drop and automatically reconnect with the new code.
 */

import {
  type ToolDefinition,
  type ToolResult,
  type ToolExecutionContext,
  type AnthropicToolSchema,
} from '../registry';

function buildAnthropicSchema(tool: ToolDefinition): AnthropicToolSchema {
  const properties: Record<string, { type: string; description: string; enum?: string[] }> = {};
  const required: string[] = [];
  for (const [key, param] of Object.entries(tool.parameters)) {
    const prop: Record<string, unknown> = {
      type: param.type,
      description: param.description,
    };
    if (param.enum) prop.enum = param.enum;
    properties[key] = prop as { type: string; description: string; enum?: string[] };
    if (param.required) required.push(key);
  }
  return {
    name: tool.name,
    description: tool.description,
    input_schema: { type: 'object', properties, required },
  };
}

export const extensionReloadTool: ToolDefinition = {
  name: 'extension_reload',
  description:
    'Reload the browser extension from disk. Use after building new code. Shows a toast on all tabs, then reloads. The WebSocket connection will drop and reconnect automatically.',
  parameters: {
    message: {
      type: 'string',
      description: 'Optional toast message to display on tabs before reloading (default: "Extension reloading...").',
      required: false,
    },
  },

  async execute(
    args: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const message = (args.message as string) || 'Extension reloading...';

    try {
      // Brief delay so the tool result can be sent before the extension dies
      setTimeout(() => {
        chrome.runtime.reload();
      }, 500);

      return { content: `Extension reloading: ${message}` };
    } catch (err) {
      return {
        content: `Failed to reload: ${err instanceof Error ? err.message : String(err)}`,
        is_error: true,
      };
    }
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

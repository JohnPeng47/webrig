/**
 * key — Press a keyboard key or key combination.
 */

import { pressKey } from '../debugger/inputDispatch';
import {
  type ToolDefinition,
  type ToolExecutionContext,
  type ToolResult,
  type AnthropicToolSchema,
  textResult,
  errorResult,
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

export const keyTool: ToolDefinition = {
  name: 'key',
  description:
    'Press a keyboard key or key combination. Supports single keys (e.g. "Enter", "Escape", "Tab") and combos (e.g. "Control+a", "Alt+F4", "Shift+Enter").',
  parameters: {
    key: {
      type: 'string',
      description:
        'The key or key combination to press. Examples: "Enter", "Escape", "Tab", "Control+a", "Control+c", "Control+v", "Shift+Enter", "Alt+Tab".',
      required: true,
    },
  },

  async execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const key = args.key as string;
    if (!key) {
      return errorResult('Missing required parameter: key');
    }

    try {
      await pressKey(context.tabId, key);
      return textResult(`Pressed key: ${key}`);
    } catch (err) {
      return errorResult(
        `Key press failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

export default keyTool;

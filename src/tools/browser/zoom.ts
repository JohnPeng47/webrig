/**
 * zoom — Set the zoom level of the current tab.
 */

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

export const zoomTool: ToolDefinition = {
  name: 'zoom',
  description:
    'Set the zoom level of the current tab. 1.0 is normal (100%), 1.5 is 150%, 2.0 is 200%, 0.5 is 50%, etc.',
  parameters: {
    level: {
      type: 'number',
      description:
        'The zoom level to set (e.g. 1.0 for 100%, 1.5 for 150%, 2.0 for 200%).',
      required: true,
    },
  },

  async execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const level = args.level as number;
    if (level == null) {
      return errorResult('Missing required parameter: level');
    }

    if (level < 0.25 || level > 5.0) {
      return errorResult('Zoom level must be between 0.25 and 5.0.');
    }

    try {
      await chrome.tabs.setZoom(context.tabId, level);
      return textResult(`Zoom set to ${level * 100}%`);
    } catch (err) {
      return errorResult(
        `Zoom failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

export default zoomTool;

/**
 * gif_creator — Stub for GIF recording functionality.
 */

import {
  type ToolDefinition,
  type ToolExecutionContext,
  type ToolResult,
  type AnthropicToolSchema,
  textResult,
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

export const gifCreatorTool: ToolDefinition = {
  name: 'gif_creator',
  description:
    'Create an animated GIF recording of browser activity. (Not yet implemented.)',
  parameters: {},

  async execute(
    _args: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    return textResult('GIF creation not yet implemented');
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

export default gifCreatorTool;

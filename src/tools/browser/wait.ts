/**
 * wait — Pause execution for a specified number of seconds.
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
    if (param.default !== undefined) prop.default = param.default;
    properties[key] = prop as { type: string; description: string; enum?: string[] };
    if (param.required) required.push(key);
  }
  return {
    name: tool.name,
    description: tool.description,
    input_schema: { type: 'object', properties, required },
  };
}

export const waitTool: ToolDefinition = {
  name: 'wait',
  description:
    'Wait for the specified number of seconds before continuing. Useful for waiting for animations, network requests, or dynamic content to load.',
  parameters: {
    seconds: {
      type: 'number',
      description: 'Number of seconds to wait. Defaults to 3.',
      required: true,
      default: 3,
    },
  },

  async execute(
    args: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const seconds = (args.seconds as number) ?? 3;

    if (seconds < 0 || seconds > 30) {
      return errorResult('Seconds must be between 0 and 30.');
    }

    await new Promise<void>((resolve) =>
      setTimeout(resolve, seconds * 1000),
    );

    return textResult(`Waited ${seconds} seconds`);
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

export default waitTool;

/**
 * type — Type text into the currently focused element.
 */

import { typeText } from '../debugger/inputDispatch';
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

export const typeTool: ToolDefinition = {
  name: 'type',
  description:
    'Type the given text into the currently focused input field or element. Focus an element first by clicking on it.',
  parameters: {
    text: {
      type: 'string',
      description: 'The text to type.',
      required: true,
    },
  },

  async execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const text = args.text as string;
    if (text == null || text === '') {
      return errorResult('Missing required parameter: text');
    }

    try {
      await typeText(context.tabId, text);
      return textResult(`Typed "${text.length > 50 ? text.substring(0, 50) + '...' : text}"`);
    } catch (err) {
      return errorResult(
        `Type failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

export default typeTool;

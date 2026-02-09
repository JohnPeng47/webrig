/**
 * left_click_drag — Click and drag from one point to another.
 */

import { drag } from '../debugger/inputDispatch';
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

export const dragTool: ToolDefinition = {
  name: 'left_click_drag',
  description:
    'Click and drag from one coordinate to another. Useful for moving elements, resizing, or drawing.',
  parameters: {
    startX: {
      type: 'number',
      description: 'Starting x-coordinate (pixels from left edge).',
      required: true,
    },
    startY: {
      type: 'number',
      description: 'Starting y-coordinate (pixels from top edge).',
      required: true,
    },
    endX: {
      type: 'number',
      description: 'Ending x-coordinate (pixels from left edge).',
      required: true,
    },
    endY: {
      type: 'number',
      description: 'Ending y-coordinate (pixels from top edge).',
      required: true,
    },
  },

  async execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const startX = args.startX as number;
    const startY = args.startY as number;
    const endX = args.endX as number;
    const endY = args.endY as number;

    if (startX == null || startY == null || endX == null || endY == null) {
      return errorResult(
        'Missing required parameters: startX, startY, endX, endY',
      );
    }

    try {
      await drag(context.tabId, startX, startY, endX, endY);
      return textResult(
        `Dragged from (${startX}, ${startY}) to (${endX}, ${endY})`,
      );
    } catch (err) {
      return errorResult(
        `Drag failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

export default dragTool;

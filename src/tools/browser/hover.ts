/**
 * hover — Move the mouse to hover over a specific coordinate.
 */

import { hover as hoverFn } from '../debugger/inputDispatch';
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

export const hoverTool: ToolDefinition = {
  name: 'hover',
  description:
    'Move the mouse to hover over the specified coordinates. Useful for revealing tooltips, dropdown menus, or hover states.',
  parameters: {
    x: {
      type: 'number',
      description: 'The x-coordinate (pixels from left edge of the viewport).',
      required: true,
    },
    y: {
      type: 'number',
      description: 'The y-coordinate (pixels from top edge of the viewport).',
      required: true,
    },
  },

  async execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const x = args.x as number;
    const y = args.y as number;

    if (x == null || y == null) {
      return errorResult('Missing required parameters: x and y');
    }

    try {
      await hoverFn(context.tabId, x, y);
      return textResult(`Hovered at (${x}, ${y})`);
    } catch (err) {
      return errorResult(
        `Hover failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

export default hoverTool;

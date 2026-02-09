/**
 * click tools — Click at a coordinate on the page.
 * Exports: clickTool, leftClickTool, rightClickTool, doubleClickTool, tripleClickTool
 */

import {
  click,
  doubleClick,
  tripleClick,
  rightClick as rightClickFn,
} from '../debugger/inputDispatch';
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

const xyParams = {
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
} as const;

export const clickTool: ToolDefinition = {
  name: 'click',
  description:
    'Click at the specified coordinates on the page. Supports left, right, and middle button.',
  parameters: {
    ...xyParams,
    button: {
      type: 'string',
      description: 'Which mouse button to use for the click.',
      enum: ['left', 'right', 'middle'],
    },
  },

  async execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const x = args.x as number;
    const y = args.y as number;
    const button = (args.button as string) || 'left';

    if (x == null || y == null) {
      return errorResult('Missing required parameters: x and y');
    }

    try {
      if (button === 'right') {
        await rightClickFn(context.tabId, x, y);
      } else {
        await click(context.tabId, x, y, {
          button: button as 'left' | 'right' | 'middle',
        });
      }
      return textResult(`Clicked (${button}) at (${x}, ${y})`);
    } catch (err) {
      return errorResult(
        `Click failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

export const leftClickTool: ToolDefinition = {
  name: 'left_click',
  description: 'Perform a left mouse click at the specified coordinates.',
  parameters: { ...xyParams },

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
      await click(context.tabId, x, y, { button: 'left' });
      return textResult(`Left-clicked at (${x}, ${y})`);
    } catch (err) {
      return errorResult(
        `Left click failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

export const rightClickTool: ToolDefinition = {
  name: 'right_click',
  description:
    'Perform a right mouse click (context menu) at the specified coordinates.',
  parameters: { ...xyParams },

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
      await rightClickFn(context.tabId, x, y);
      return textResult(`Right-clicked at (${x}, ${y})`);
    } catch (err) {
      return errorResult(
        `Right click failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

export const doubleClickTool: ToolDefinition = {
  name: 'double_click',
  description: 'Perform a double left-click at the specified coordinates.',
  parameters: { ...xyParams },

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
      await doubleClick(context.tabId, x, y);
      return textResult(`Double-clicked at (${x}, ${y})`);
    } catch (err) {
      return errorResult(
        `Double click failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

export const tripleClickTool: ToolDefinition = {
  name: 'triple_click',
  description:
    'Perform a triple left-click at the specified coordinates. Typically selects an entire line or paragraph.',
  parameters: { ...xyParams },

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
      await tripleClick(context.tabId, x, y);
      return textResult(`Triple-clicked at (${x}, ${y})`);
    } catch (err) {
      return errorResult(
        `Triple click failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

export default clickTool;

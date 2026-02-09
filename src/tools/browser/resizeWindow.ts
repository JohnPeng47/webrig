/**
 * resize_window — Resize the browser window.
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

export const resizeWindowTool: ToolDefinition = {
  name: 'resize_window',
  description:
    'Resize the browser window to the specified width and height in pixels.',
  parameters: {
    width: {
      type: 'number',
      description: 'The desired window width in pixels.',
      required: true,
    },
    height: {
      type: 'number',
      description: 'The desired window height in pixels.',
      required: true,
    },
  },

  async execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const width = args.width as number;
    const height = args.height as number;

    if (width == null || height == null) {
      return errorResult('Missing required parameters: width and height');
    }

    if (width < 200 || height < 200) {
      return errorResult('Width and height must each be at least 200 pixels.');
    }

    try {
      const tab = await chrome.tabs.get(context.tabId);
      if (!tab.windowId) {
        return errorResult('Could not determine window ID for the current tab.');
      }

      await chrome.windows.update(tab.windowId, { width, height });
      return textResult(`Resized window to ${width}x${height}`);
    } catch (err) {
      return errorResult(
        `Resize failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

export default resizeWindowTool;

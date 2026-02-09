/**
 * screenshot — Capture a screenshot of the current tab.
 */

import { captureScreenshot } from '../debugger/screenshotCapture';
import {
  type ToolDefinition,
  type ToolExecutionContext,
  type ToolResult,
  type AnthropicToolSchema,
  imageResult,
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

export const screenshotTool: ToolDefinition = {
  name: 'screenshot',
  description:
    'Capture a screenshot of the current tab and return it as a base64-encoded PNG image.',
  parameters: {},

  async execute(
    _args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    try {
      const base64 = await captureScreenshot(context.tabId);
      return imageResult(base64);
    } catch (err) {
      return errorResult(
        `Failed to capture screenshot: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

export default screenshotTool;

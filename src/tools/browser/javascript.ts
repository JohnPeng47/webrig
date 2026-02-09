/**
 * javascript_tool — Execute arbitrary JavaScript in the page context via CDP.
 */

import { cdpClient } from '../debugger/cdpClient';
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

export const javascriptTool: ToolDefinition = {
  name: 'javascript_tool',
  description:
    'Execute JavaScript code in the context of the current page using Chrome DevTools Protocol (Runtime.evaluate). Returns the result of the expression.',
  parameters: {
    code: {
      type: 'string',
      description:
        'The JavaScript code to execute. Can be an expression (returns its value) or statements wrapped in an IIFE.',
      required: true,
    },
  },

  async execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const code = args.code as string;
    if (!code) {
      return errorResult('Missing required parameter: code');
    }

    try {
      const response = await cdpClient.sendCommand(context.tabId, 'Runtime.evaluate', {
        expression: code,
        returnByValue: true,
        awaitPromise: true,
        userGesture: true,
        timeout: 10000,
      }) as {
        result: {
          type: string;
          value?: unknown;
          description?: string;
          subtype?: string;
        };
        exceptionDetails?: {
          text: string;
          exception?: { description?: string };
        };
      };

      if (response.exceptionDetails) {
        const errMsg =
          response.exceptionDetails.exception?.description ||
          response.exceptionDetails.text;
        return errorResult(`JavaScript error: ${errMsg}`);
      }

      const { result } = response;

      if (result.type === 'undefined') {
        return textResult('undefined');
      }

      if (result.value !== undefined) {
        const valueStr =
          typeof result.value === 'object'
            ? JSON.stringify(result.value, null, 2)
            : String(result.value);
        return textResult(valueStr);
      }

      return textResult(result.description || `[${result.type}]`);
    } catch (err) {
      return errorResult(
        `JavaScript execution failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

export default javascriptTool;

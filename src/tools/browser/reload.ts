/**
 * reload — Reload the current tab.
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

export const reloadTool: ToolDefinition = {
  name: 'reload',
  description:
    'Reload the current tab. Waits for the page to finish loading before returning.',
  parameters: {},

  async execute(
    _args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    try {
      await chrome.tabs.reload(context.tabId);

      // Wait for the tab to finish loading
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }, 15000);

        const listener = (
          tabId: number,
          changeInfo: chrome.tabs.OnUpdatedInfo,
        ) => {
          if (tabId === context.tabId && changeInfo.status === 'complete') {
            clearTimeout(timeout);
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };

        chrome.tabs.onUpdated.addListener(listener);
      });

      const tab = await chrome.tabs.get(context.tabId);
      return textResult(`Reloaded page: ${tab.url || '(unknown URL)'}`);
    } catch (err) {
      return errorResult(
        `Reload failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

export default reloadTool;

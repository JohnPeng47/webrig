/**
 * navigate — Navigate the current tab to a given URL.
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

export const navigateTool: ToolDefinition = {
  name: 'navigate',
  description:
    'Navigate the browser to the specified URL. Waits for the page to finish loading before returning.',
  parameters: {
    url: {
      type: 'string',
      description: 'The URL to navigate to (e.g. "https://example.com").',
      required: true,
    },
  },

  async execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const url = args.url as string;
    if (!url) {
      return errorResult('Missing required parameter: url');
    }

    try {
      await chrome.tabs.update(context.tabId, { url });

      // Wait for the tab to finish loading
      const finalUrl = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener);
          // Resolve with whatever URL we have even on timeout
          chrome.tabs.get(context.tabId).then((tab) => resolve(tab.url || url));
        }, 30000);

        const listener = (
          tabId: number,
          changeInfo: chrome.tabs.OnUpdatedInfo,
        ) => {
          if (tabId === context.tabId && changeInfo.status === 'complete') {
            clearTimeout(timeout);
            chrome.tabs.onUpdated.removeListener(listener);
            chrome.tabs.get(context.tabId).then((tab) => resolve(tab.url || url));
          }
        };

        chrome.tabs.onUpdated.addListener(listener);
      });

      return textResult(`Navigated to ${finalUrl}`);
    } catch (err) {
      return errorResult(
        `Failed to navigate: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

export default navigateTool;

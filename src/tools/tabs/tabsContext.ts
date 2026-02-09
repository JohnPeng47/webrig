/**
 * tabs_context / tabs_context_mcp — List tabs in the current tab group.
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

async function queryTabs(
  context: ToolExecutionContext,
): Promise<Array<{ id: number; url: string; title: string; active: boolean }>> {
  let tabs: chrome.tabs.Tab[];

  if (context.tabGroupId != null && context.tabGroupId !== -1) {
    tabs = await chrome.tabs.query({ groupId: context.tabGroupId });
  } else {
    // Fall back to querying the same window as the target tab
    const targetTab = await chrome.tabs.get(context.tabId);
    tabs = await chrome.tabs.query({ windowId: targetTab.windowId });
  }

  return tabs.map((tab) => ({
    id: tab.id ?? 0,
    url: tab.url ?? '',
    title: tab.title ?? '',
    active: tab.active ?? false,
  }));
}

export const tabsContextTool: ToolDefinition = {
  name: 'tabs_context',
  description:
    'List all tabs in the current tab group (or window if no tab group). Returns an array of objects with id, url, title, and active status.',
  parameters: {},

  async execute(
    _args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    try {
      const tabs = await queryTabs(context);
      return textResult(JSON.stringify(tabs, null, 2));
    } catch (err) {
      return errorResult(
        `Failed to query tabs: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

export const tabsContextMcpTool: ToolDefinition = {
  name: 'tabs_context_mcp',
  description:
    'List all tabs in the current tab group with MCP context. Returns tab list along with the tab group ID for reference.',
  parameters: {},

  async execute(
    _args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    try {
      const tabs = await queryTabs(context);
      const result = {
        tabGroupId: context.tabGroupId ?? null,
        tabs,
      };
      return textResult(JSON.stringify(result, null, 2));
    } catch (err) {
      return errorResult(
        `Failed to query tabs (MCP): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

export default tabsContextTool;

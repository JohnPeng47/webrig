/**
 * tabs_create / tabs_create_mcp — Create a new tab.
 */

import {
  type ToolDefinition,
  type ToolExecutionContext,
  type ToolResult,
  type AnthropicToolSchema,
  textResult,
  errorResult,
} from '../registry';
import { tabManager } from '../../service-worker/tabManager';

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

async function createTab(
  url: string,
  context: ToolExecutionContext,
  name?: string,
): Promise<chrome.tabs.Tab> {
  // Determine which window to open in — use current tab's window, or fall back to last focused
  let windowId: number | undefined;
  if (context.tabId > 0) {
    try {
      const currentTab = await chrome.tabs.get(context.tabId);
      windowId = currentTab.windowId;
    } catch {
      // Tab no longer exists; fall through to getLastFocused
    }
  }
  if (windowId === undefined) {
    const win = await chrome.windows.getLastFocused();
    windowId = win.id;
  }

  const newTab = await chrome.tabs.create({
    url,
    windowId,
  });

  // Always create a new tab group for this tab
  if (newTab.id != null) {
    try {
      await tabManager.createGroup(newTab.id, name);
    } catch {
      // Tab grouping is not fatal
    }
  }

  return newTab;
}

export const tabsCreateTool: ToolDefinition = {
  name: 'tabs_create',
  description:
    'Create a new browser tab with the given URL. The tab is added to a named tab group.',
  parameters: {
    url: {
      type: 'string',
      description: 'The URL to open in the new tab.',
      required: true,
    },
    name: {
      type: 'string',
      description: 'Short label (2 words max) for the tab group, describing the task.',
      required: false,
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
    const name = args.name as string | undefined;

    try {
      const tab = await createTab(url, context, name);
      return textResult(
        JSON.stringify(
          {
            id: tab.id,
            url: tab.url || tab.pendingUrl || url,
            title: tab.title || '',
          },
          null,
          2,
        ),
      );
    } catch (err) {
      return errorResult(
        `Failed to create tab: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

export const tabsCreateMcpTool: ToolDefinition = {
  name: 'tabs_create_mcp',
  description:
    'Create a new browser tab with the given URL (MCP variant). Returns tab info along with tab group context.',
  parameters: {
    url: {
      type: 'string',
      description: 'The URL to open in the new tab.',
      required: true,
    },
    name: {
      type: 'string',
      description: 'Short label (2 words max) for the tab group, describing the task.',
      required: false,
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
    const name = args.name as string | undefined;

    try {
      const tab = await createTab(url, context, name);
      return textResult(
        JSON.stringify(
          {
            id: tab.id,
            url: tab.url || tab.pendingUrl || url,
            title: tab.title || '',
            tabGroupId: context.tabGroupId ?? null,
          },
          null,
          2,
        ),
      );
    } catch (err) {
      return errorResult(
        `Failed to create tab (MCP): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

export default tabsCreateTool;

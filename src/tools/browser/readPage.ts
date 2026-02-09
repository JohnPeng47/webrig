/**
 * read_page / get_page_text — Read page content via accessibility tree or raw text.
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
    if (param.default !== undefined) prop.default = param.default;
    properties[key] = prop as { type: string; description: string; enum?: string[] };
    if (param.required) required.push(key);
  }
  return {
    name: tool.name,
    description: tool.description,
    input_schema: { type: 'object', properties, required },
  };
}

export const readPageTool: ToolDefinition = {
  name: 'read_page',
  description:
    'Read the current page content as an accessibility tree. Returns a structured tree of page elements with roles, labels, and ref IDs that can be used to interact with specific elements.',
  parameters: {
    filter: {
      type: 'string',
      description:
        'Filter which elements to include: "all" for all visible elements, "interactive" for only interactive elements (links, buttons, inputs). Defaults to "all".',
      default: 'all',
      enum: ['all', 'interactive'],
    },
    depth: {
      type: 'number',
      description:
        'Maximum depth of the accessibility tree to return. Higher values give more detail but more output. Defaults to 15.',
      default: 15,
    },
    refId: {
      type: 'string',
      description:
        'Optional ref ID of a specific element to read the subtree of. Use this to drill into a specific section of the page.',
    },
  },

  async execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const filter = (args.filter as string) || 'all';
    const depth = (args.depth as number) ?? 15;
    const refId = args.refId as string | undefined;

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: context.tabId },
        func: (f: string, d: number, r?: string) => {
          if (typeof window.__generateAccessibilityTree !== 'function') {
            return { error: 'Accessibility tree script not injected on this page.' };
          }
          return window.__generateAccessibilityTree(f, d, undefined, r);
        },
        args: [filter, depth, refId ?? undefined],
      });

      const result = results?.[0]?.result as {
        pageContent?: string;
        viewport?: { width: number; height: number };
        error?: string;
      } | undefined;

      if (!result) {
        return errorResult('No result from page script execution.');
      }

      if (result.error) {
        return errorResult(result.error);
      }

      const viewport = result.viewport
        ? `[Viewport: ${result.viewport.width}x${result.viewport.height}]`
        : '';

      const content = result.pageContent || '(empty page)';
      return textResult(`${viewport}\n${content}`);
    } catch (err) {
      return errorResult(
        `Read page failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

export const getPageTextTool: ToolDefinition = {
  name: 'get_page_text',
  description:
    'Get the full text content of the current page as plain text (document.body.innerText). Useful for reading articles, documentation, or other text-heavy pages.',
  parameters: {},

  async execute(
    _args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: context.tabId },
        func: () => {
          return document.body?.innerText || '(empty page)';
        },
      });

      const text = results?.[0]?.result as string | undefined;
      if (!text) {
        return errorResult('No text content returned from the page.');
      }

      return textResult(text);
    } catch (err) {
      return errorResult(
        `Get page text failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

export default readPageTool;

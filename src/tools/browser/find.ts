/**
 * find — Search the DOM for elements containing the given text.
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

export const findTool: ToolDefinition = {
  name: 'find',
  description:
    'Search the DOM for visible elements containing text that matches the given query. Returns matching elements with their accessibility refs, tags, and text content.',
  parameters: {
    query: {
      type: 'string',
      description: 'The text to search for in the page content.',
      required: true,
    },
  },

  async execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const query = args.query as string;
    if (!query) {
      return errorResult('Missing required parameter: query');
    }

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: context.tabId },
        func: (searchQuery: string) => {
          const matches: Array<{
            ref: string;
            tag: string;
            text: string;
            rect: { x: number; y: number; width: number; height: number };
          }> = [];

          // Ensure global state is initialized
          if (!window.__claudeElementMap) {
            window.__claudeElementMap = new Map();
          }
          if (!window.__claudeRefCounter) {
            window.__claudeRefCounter = 0;
          }

          const lowerQuery = searchQuery.toLowerCase();
          const allElements = document.querySelectorAll('*');

          for (const el of allElements) {
            // Skip non-visible and script/style elements
            const tag = el.tagName.toLowerCase();
            if (['script', 'style', 'meta', 'link', 'noscript'].includes(tag)) continue;

            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') continue;

            // Check direct text content (not descendants)
            let directText = '';
            for (const child of el.childNodes) {
              if (child.nodeType === Node.TEXT_NODE) {
                directText += child.textContent || '';
              }
            }

            if (directText.toLowerCase().includes(lowerQuery)) {
              // Assign or find existing ref
              let ref: string | null = null;
              for (const [refId, weakRef] of window.__claudeElementMap) {
                if (weakRef.deref() === el) {
                  ref = refId;
                  break;
                }
              }
              if (!ref) {
                ref = 'ref_' + ++window.__claudeRefCounter;
                window.__claudeElementMap.set(ref, new WeakRef(el));
              }

              const rect = el.getBoundingClientRect();
              matches.push({
                ref,
                tag,
                text: directText.trim().substring(0, 200),
                rect: {
                  x: Math.round(rect.x),
                  y: Math.round(rect.y),
                  width: Math.round(rect.width),
                  height: Math.round(rect.height),
                },
              });

              if (matches.length >= 20) break;
            }
          }

          return matches;
        },
        args: [query],
      });

      const matches = results?.[0]?.result as Array<{
        ref: string;
        tag: string;
        text: string;
        rect: { x: number; y: number; width: number; height: number };
      }> | undefined;

      if (!matches || matches.length === 0) {
        return textResult(`No elements found matching "${query}".`);
      }

      const lines = matches.map(
        (m) =>
          `[${m.ref}] <${m.tag}> at (${m.rect.x},${m.rect.y}) ${m.rect.width}x${m.rect.height} — "${m.text}"`,
      );

      return textResult(
        `Found ${matches.length} element(s) matching "${query}":\n${lines.join('\n')}`,
      );
    } catch (err) {
      return errorResult(
        `Find failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

export default findTool;

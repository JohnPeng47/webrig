/**
 * scroll / scroll_to — Scroll the page by direction+amount, or scroll to text.
 */

import { scroll as scrollFn } from '../debugger/inputDispatch';
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

export const scrollTool: ToolDefinition = {
  name: 'scroll',
  description:
    'Scroll the page in a given direction by a specified number of "clicks" (each click is ~100px).',
  parameters: {
    direction: {
      type: 'string',
      description: 'The direction to scroll.',
      required: true,
      enum: ['up', 'down', 'left', 'right'],
    },
    amount: {
      type: 'number',
      description:
        'Number of scroll increments (each ~100px). Defaults to 3.',
      default: 3,
    },
  },

  async execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const direction = args.direction as string;
    const amount = (args.amount as number) ?? 3;

    if (!direction) {
      return errorResult('Missing required parameter: direction');
    }

    let deltaX = 0;
    let deltaY = 0;
    const pixelsPerClick = 100;

    switch (direction) {
      case 'up':
        deltaY = -pixelsPerClick * amount;
        break;
      case 'down':
        deltaY = pixelsPerClick * amount;
        break;
      case 'left':
        deltaX = -pixelsPerClick * amount;
        break;
      case 'right':
        deltaX = pixelsPerClick * amount;
        break;
      default:
        return errorResult(
          `Invalid direction: ${direction}. Use up, down, left, or right.`,
        );
    }

    try {
      // Scroll at the center of the viewport
      const centerX = 640;
      const centerY = 360;
      await scrollFn(context.tabId, centerX, centerY, deltaX, deltaY);
      return textResult(`Scrolled ${direction} by ${amount} increments`);
    } catch (err) {
      return errorResult(
        `Scroll failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

export const scrollToTool: ToolDefinition = {
  name: 'scroll_to',
  description:
    'Scroll the page so that the first element containing the specified text becomes visible.',
  parameters: {
    text: {
      type: 'string',
      description: 'The text to find and scroll into view.',
      required: true,
    },
  },

  async execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const text = args.text as string;
    if (!text) {
      return errorResult('Missing required parameter: text');
    }

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: context.tabId },
        func: (searchText: string) => {
          const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
          );
          let node: Text | null;
          while ((node = walker.nextNode() as Text | null)) {
            if (
              node.textContent &&
              node.textContent.toLowerCase().includes(searchText.toLowerCase())
            ) {
              const el = node.parentElement;
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return { found: true, tag: el.tagName.toLowerCase() };
              }
            }
          }
          return { found: false };
        },
        args: [text],
      });

      const result = results?.[0]?.result as
        | { found: boolean; tag?: string }
        | undefined;

      if (result?.found) {
        return textResult(
          `Scrolled to element <${result.tag}> containing "${text}"`,
        );
      } else {
        return errorResult(`Could not find text "${text}" on the page.`);
      }
    } catch (err) {
      return errorResult(
        `Scroll-to failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

export default scrollTool;

/**
 * read_console_messages — Read browser console output via CDP.
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

/** In-memory store for console messages captured via CDP. */
const consoleMessages: Array<{
  level: string;
  text: string;
  timestamp: number;
  url?: string;
  line?: number;
}> = [];

/** Maximum number of console messages to keep. */
const MAX_MESSAGES = 200;

/** Tabs that already have console monitoring enabled. */
const enabledTabs = new Set<number>();

/**
 * Start listening for console messages on a tab.
 * Called internally when the tool is first used.
 */
async function ensureConsoleEnabled(tabId: number): Promise<void> {
  if (enabledTabs.has(tabId)) return;

  try {
    await cdpClient.sendCommand(tabId, 'Runtime.enable');
    enabledTabs.add(tabId);

    // Listen for CDP events via chrome.debugger.onEvent
    const listener = (
      source: chrome.debugger.Debuggee,
      method: string,
      params?: object,
    ) => {
      if (source.tabId !== tabId) return;

      if (method === 'Runtime.consoleAPICalled') {
        const p = params as {
          type: string;
          args: Array<{ type: string; value?: unknown; description?: string }>;
          timestamp: number;
          stackTrace?: { callFrames: Array<{ url: string; lineNumber: number }> };
        };

        const text = p.args
          .map((arg) => {
            if (arg.value !== undefined) return String(arg.value);
            if (arg.description) return arg.description;
            return `[${arg.type}]`;
          })
          .join(' ');

        const frame = p.stackTrace?.callFrames?.[0];

        consoleMessages.push({
          level: p.type,
          text,
          timestamp: p.timestamp,
          url: frame?.url,
          line: frame?.lineNumber,
        });

        while (consoleMessages.length > MAX_MESSAGES) {
          consoleMessages.shift();
        }
      }

      if (method === 'Runtime.exceptionThrown') {
        const p = params as {
          timestamp: number;
          exceptionDetails: {
            text: string;
            exception?: { description?: string };
            url?: string;
            lineNumber?: number;
          };
        };
        const detail = p.exceptionDetails;
        consoleMessages.push({
          level: 'error',
          text: detail.exception?.description || detail.text,
          timestamp: p.timestamp,
          url: detail.url,
          line: detail.lineNumber,
        });

        while (consoleMessages.length > MAX_MESSAGES) {
          consoleMessages.shift();
        }
      }
    };

    chrome.debugger.onEvent.addListener(listener);
  } catch {
    // Runtime may already be enabled; that's fine
  }
}

export const readConsoleTool: ToolDefinition = {
  name: 'read_console_messages',
  description:
    'Read browser console messages (log, warn, error, info) captured from the current tab. Enables console monitoring via CDP if not already active.',
  parameters: {},

  async execute(
    _args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    try {
      await ensureConsoleEnabled(context.tabId);

      if (consoleMessages.length === 0) {
        return textResult(
          'No console messages captured yet. Console monitoring is now active — try again after page interactions.',
        );
      }

      const formatted = consoleMessages.map((msg) => {
        const loc = msg.url ? ` (${msg.url}${msg.line != null ? `:${msg.line}` : ''})` : '';
        return `[${msg.level.toUpperCase()}] ${msg.text}${loc}`;
      });

      return textResult(
        `Console messages (${consoleMessages.length}):\n${formatted.join('\n')}`,
      );
    } catch (err) {
      return errorResult(
        `Read console failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

export default readConsoleTool;

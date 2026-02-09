/**
 * read_network_requests — Read network requests captured via CDP.
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

/** In-memory store for network requests captured via CDP. */
const networkRequests: Array<{
  requestId: string;
  method: string;
  url: string;
  status?: number;
  statusText?: string;
  type?: string;
  timestamp: number;
  responseSize?: number;
}> = [];

const MAX_REQUESTS = 200;

/** Tabs that already have network monitoring enabled. */
const enabledTabs = new Set<number>();

async function ensureNetworkEnabled(tabId: number): Promise<void> {
  if (enabledTabs.has(tabId)) return;

  try {
    await cdpClient.sendCommand(tabId, 'Network.enable');
    enabledTabs.add(tabId);

    const listener = (
      source: chrome.debugger.Debuggee,
      method: string,
      params?: object,
    ) => {
      if (source.tabId !== tabId) return;

      if (method === 'Network.requestWillBeSent') {
        const p = params as {
          requestId: string;
          request: { method: string; url: string };
          type: string;
          timestamp: number;
        };

        networkRequests.push({
          requestId: p.requestId,
          method: p.request.method,
          url: p.request.url,
          type: p.type,
          timestamp: p.timestamp,
        });

        while (networkRequests.length > MAX_REQUESTS) {
          networkRequests.shift();
        }
      }

      if (method === 'Network.responseReceived') {
        const p = params as {
          requestId: string;
          response: {
            status: number;
            statusText: string;
            headers: Record<string, string>;
          };
        };

        const entry = networkRequests.find(
          (r) => r.requestId === p.requestId,
        );
        if (entry) {
          entry.status = p.response.status;
          entry.statusText = p.response.statusText;
          const contentLength =
            p.response.headers['content-length'] ||
            p.response.headers['Content-Length'];
          if (contentLength) {
            entry.responseSize = parseInt(contentLength, 10);
          }
        }
      }
    };

    chrome.debugger.onEvent.addListener(listener);
  } catch {
    // Network may already be enabled
  }
}

export const readNetworkTool: ToolDefinition = {
  name: 'read_network_requests',
  description:
    'Read network requests captured from the current tab. Enables network monitoring via CDP if not already active. Shows URL, method, status, and type for each request.',
  parameters: {},

  async execute(
    _args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    try {
      await ensureNetworkEnabled(context.tabId);

      if (networkRequests.length === 0) {
        return textResult(
          'No network requests captured yet. Network monitoring is now active — try again after page interactions.',
        );
      }

      const formatted = networkRequests.map((req) => {
        const status =
          req.status != null ? ` ${req.status} ${req.statusText || ''}` : ' (pending)';
        const size = req.responseSize != null ? ` ${req.responseSize}B` : '';
        const type = req.type ? ` [${req.type}]` : '';
        return `${req.method} ${req.url}${status}${size}${type}`;
      });

      return textResult(
        `Network requests (${networkRequests.length}):\n${formatted.join('\n')}`,
      );
    } catch (err) {
      return errorResult(
        `Read network failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

export default readNetworkTool;

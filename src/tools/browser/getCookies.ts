/**
 * get_cookies — Retrieve all cookies for a given domain.
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

export const getCookiesTool: ToolDefinition = {
  name: 'get_cookies',
  description:
    'Retrieve all cookies for a given domain. Returns cookie name, value, path, expiration, and flags (secure, httpOnly, sameSite).',
  parameters: {
    domain: {
      type: 'string',
      description: 'The domain to retrieve cookies for (e.g. "example.com"). Matches cookies with this domain and all subdomains.',
      required: true,
    },
  },

  async execute(
    args: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const domain = args.domain as string;
    if (!domain) {
      return errorResult('Missing required parameter: domain');
    }

    try {
      const cookies = await chrome.cookies.getAll({ domain });

      if (cookies.length === 0) {
        return textResult(`No cookies found for domain "${domain}".`);
      }

      const formatted = cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly,
        sameSite: c.sameSite,
        expirationDate: c.expirationDate
          ? new Date(c.expirationDate * 1000).toISOString()
          : 'session',
      }));

      return textResult(JSON.stringify(formatted, null, 2));
    } catch (err) {
      return errorResult(
        `Failed to get cookies: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

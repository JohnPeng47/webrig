/**
 * shortcuts_list — List saved prompt shortcuts.
 */

import { StorageKey } from '../../types/storage';
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

export const shortcutsListTool: ToolDefinition = {
  name: 'shortcuts_list',
  description:
    'List all saved prompt shortcuts. Returns an array of saved prompts with their names, commands, and content.',
  parameters: {},

  async execute(
    _args: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    try {
      const data = await chrome.storage.local.get(StorageKey.SAVED_PROMPTS);
      const prompts = (data[StorageKey.SAVED_PROMPTS] as unknown[]) || [];

      if (prompts.length === 0) {
        return textResult('No saved prompts found.');
      }

      return textResult(JSON.stringify(prompts, null, 2));
    } catch (err) {
      return errorResult(
        `Failed to list shortcuts: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

export default shortcutsListTool;

/**
 * shortcuts_execute — Execute a saved prompt shortcut by command name.
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

interface SavedPrompt {
  name?: string;
  command?: string;
  prompt?: string;
  [key: string]: unknown;
}

export const shortcutsExecuteTool: ToolDefinition = {
  name: 'shortcuts_execute',
  description:
    'Execute a saved prompt shortcut by its command name. Looks up the prompt in saved shortcuts and returns its content for execution.',
  parameters: {
    command: {
      type: 'string',
      description:
        'The command name of the shortcut to execute (e.g. "summarize", "translate").',
      required: true,
    },
  },

  async execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const command = args.command as string;
    if (!command) {
      return errorResult('Missing required parameter: command');
    }

    try {
      const data = await chrome.storage.local.get(StorageKey.SAVED_PROMPTS);
      const prompts = (data[StorageKey.SAVED_PROMPTS] as SavedPrompt[]) || [];

      const match = prompts.find(
        (p) =>
          p.command?.toLowerCase() === command.toLowerCase() ||
          p.name?.toLowerCase() === command.toLowerCase(),
      );

      if (!match) {
        const available = prompts
          .map((p) => p.command || p.name || '(unnamed)')
          .join(', ');
        return errorResult(
          `Shortcut "${command}" not found. Available shortcuts: ${available || '(none)'}`,
        );
      }

      const promptText = match.prompt || '';
      if (!promptText) {
        return errorResult(
          `Shortcut "${command}" found but has no prompt content.`,
        );
      }

      // Send the prompt content as a message for the agent to process
      try {
        await chrome.runtime.sendMessage({
          type: 'EXECUTE_SHORTCUT',
          command,
          prompt: promptText,
          tabId: context.tabId,
        });
      } catch {
        // Message delivery is best-effort
      }

      return textResult(
        `Executing shortcut "${match.name || match.command}":\n${promptText}`,
      );
    } catch (err) {
      return errorResult(
        `Failed to execute shortcut: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

export default shortcutsExecuteTool;

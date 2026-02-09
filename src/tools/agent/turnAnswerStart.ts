/**
 * turn_answer_start — Signal the beginning of an answer turn.
 */

import {
  type ToolDefinition,
  type ToolExecutionContext,
  type ToolResult,
  type AnthropicToolSchema,
  textResult,
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

export const turnAnswerStartTool: ToolDefinition = {
  name: 'turn_answer_start',
  description:
    'Signal the start of an answer turn. Used internally to coordinate multi-turn conversations and let the UI know the agent is about to provide a final response.',
  parameters: {},

  async execute(
    _args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    // Notify the UI that the answer turn is starting
    try {
      await chrome.runtime.sendMessage({
        type: 'ANSWER_TURN_STARTED',
        tabId: context.tabId,
        toolUseId: context.toolUseId,
      });
    } catch {
      // Side panel may not be open; acceptable
    }

    return textResult('Answer turn started');
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

export default turnAnswerStartTool;

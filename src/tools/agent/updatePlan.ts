/**
 * update_plan — Store and broadcast the agent's current plan.
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

/** Most recently stored plan (module-level state). */
let currentPlan: string | null = null;

/** Retrieve the current plan (for use by other modules). */
export function getCurrentPlan(): string | null {
  return currentPlan;
}

export const updatePlanTool: ToolDefinition = {
  name: 'update_plan',
  description:
    'Store and broadcast an updated plan for the current task. The plan is shown in the side panel UI so the user can follow the agent\'s reasoning.',
  parameters: {
    plan: {
      type: 'string',
      description:
        'A concise description of the plan or next steps for the current task.',
      required: true,
    },
  },

  async execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const plan = args.plan as string;
    if (!plan) {
      return errorResult('Missing required parameter: plan');
    }

    // Store the plan
    currentPlan = plan;

    // Broadcast to the side panel UI
    try {
      await chrome.runtime.sendMessage({
        type: 'PLAN_UPDATED',
        plan,
        tabId: context.tabId,
        toolUseId: context.toolUseId,
      });
    } catch {
      // Side panel may not be open; that's acceptable
    }

    return textResult('Plan updated');
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

export default updatePlanTool;

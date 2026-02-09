/**
 * Tool registry — central store for all available tool definitions
 * and the main dispatcher that routes tool invocations.
 *
 * HEADLESS BUILD: No permission checks. Every tool invocation proceeds
 * immediately without gating.
 */

import type {
  ToolDefinition,
  ToolResult,
  ToolExecutionContext,
  AnthropicToolSchema,
} from '../types/tools';

// Re-export core types so consumers can import from a single place.
export type { ToolDefinition, ToolResult, ToolExecutionContext, AnthropicToolSchema };

// ── Result helpers ──────────────────────────────────────────────────

export function errorResult(message: string): ToolResult {
  return { content: message, is_error: true };
}

export function textResult(content: string): ToolResult {
  return { content };
}

export function imageResult(base64: string, mediaType = 'image/png'): ToolResult {
  return {
    content: [
      { type: 'image', data: base64, media_type: mediaType },
    ],
  };
}

// ── Dispatcher input ────────────────────────────────────────────────

export interface ExecuteToolParams {
  toolName: string;
  args: Record<string, unknown>;
  tabId?: number;
  tabGroupId?: number;
  clientId?: string;
  source: 'bridge';
  toolUseId: string;
}

// ── Registry singleton ──────────────────────────────────────────────

class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  getAllSchemas(): AnthropicToolSchema[] {
    return this.getAll().map((t) => t.toAnthropicSchema());
  }

  getAnthropicSchemas(): AnthropicToolSchema[] {
    return this.getAllSchemas();
  }

  // ── Dispatcher ──────────────────────────────────────────────────

  /**
   * Main dispatcher — look up a tool by name, build context, execute.
   * NO permission checks — every tool invocation proceeds immediately.
   */
  async executeTool(params: ExecuteToolParams): Promise<ToolResult> {
    const {
      toolName,
      args,
      tabId,
      tabGroupId,
      clientId,
      source,
      toolUseId,
    } = params;

    // 1. Look up the tool.
    const tool = this.tools.get(toolName);
    if (!tool) {
      return errorResult(
        `Unknown tool: "${toolName}". Available tools: ${Array.from(this.tools.keys()).join(', ')}`,
      );
    }

    // 2. Build execution context (no permission fields).
    const context: ToolExecutionContext = {
      toolUseId,
      tabId: tabId ?? -1,
      tabGroupId,
      clientId,
      source,
    };

    // 3. Execute immediately — no permission gating.
    try {
      const result = await tool.execute(args, context);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`Tool "${toolName}" failed: ${message}`);
    }
  }
}

export const toolRegistry = new ToolRegistry();

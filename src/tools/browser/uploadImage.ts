/**
 * upload_image — Upload a base64-encoded image (stub implementation).
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

export const uploadImageTool: ToolDefinition = {
  name: 'upload_image',
  description:
    'Upload a base64-encoded image to the browser context. Can be used to provide image data for file upload fields or other image-accepting interfaces.',
  parameters: {
    imageData: {
      type: 'string',
      description: 'Base64-encoded image data (PNG, JPEG, etc.).',
      required: true,
    },
  },

  async execute(
    args: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const imageData = args.imageData as string;
    if (!imageData) {
      return errorResult('Missing required parameter: imageData');
    }

    // Stub implementation
    return textResult('Image uploaded');
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

export default uploadImageTool;

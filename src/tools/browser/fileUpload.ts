/**
 * file_upload — Set files on a file input element via CDP.
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
    if (param.items) prop.items = param.items;
    properties[key] = prop as { type: string; description: string; enum?: string[] };
    if (param.required) required.push(key);
  }
  return {
    name: tool.name,
    description: tool.description,
    input_schema: { type: 'object', properties, required },
  };
}

export const fileUploadTool: ToolDefinition = {
  name: 'file_upload',
  description:
    'Upload files to a file input element identified by its ref ID. Uses Chrome DevTools Protocol DOM.setFileInputFiles to set the files.',
  parameters: {
    refId: {
      type: 'string',
      description:
        'The ref ID of the file input element (e.g. "ref_5"), obtained from read_page or find.',
      required: true,
    },
    filePaths: {
      type: 'array',
      description:
        'Array of absolute file paths to upload (e.g. ["/path/to/file.pdf"]).',
      required: true,
      items: { type: 'string' },
    },
  },

  async execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const refId = args.refId as string;
    const filePaths = args.filePaths as string[];

    if (!refId) {
      return errorResult('Missing required parameter: refId');
    }
    if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
      return errorResult('Missing required parameter: filePaths (must be a non-empty array)');
    }

    try {
      // First, resolve the ref to a DOM node via scripting
      const resolveResults = await chrome.scripting.executeScript({
        target: { tabId: context.tabId },
        func: (ref: string) => {
          if (!window.__claudeElementMap) {
            return { error: 'Element map not initialized.' };
          }
          const weakRef = window.__claudeElementMap.get(ref);
          if (!weakRef) {
            return { error: `Element with ref "${ref}" not found.` };
          }
          const el = weakRef.deref();
          if (!el) {
            return { error: `Element with ref "${ref}" no longer exists.` };
          }
          if (el.tagName.toLowerCase() !== 'input' || el.getAttribute('type') !== 'file') {
            return { error: `Element [${ref}] is not a file input.` };
          }
          // Store the element as a temporary global for CDP to query
          (window as unknown as Record<string, unknown>).__claudeFileInputTarget = el;
          return { success: true };
        },
        args: [refId],
      });

      const resolveResult = resolveResults?.[0]?.result as
        | { success?: boolean; error?: string }
        | undefined;

      if (resolveResult?.error) {
        return errorResult(resolveResult.error);
      }

      // Use CDP to get the node and set files
      // Evaluate to get the remote object ID of the file input
      const evalResult = await cdpClient.sendCommand(context.tabId, 'Runtime.evaluate', {
        expression: 'window.__claudeFileInputTarget',
        returnByValue: false,
      }) as { result: { objectId?: string } };

      if (!evalResult.result.objectId) {
        return errorResult('Could not resolve file input element via CDP.');
      }

      // Request the DOM node
      const nodeResult = await cdpClient.sendCommand(context.tabId, 'DOM.requestNode', {
        objectId: evalResult.result.objectId,
      }) as { nodeId: number };

      // Set files on the input
      await cdpClient.sendCommand(context.tabId, 'DOM.setFileInputFiles', {
        files: filePaths,
        nodeId: nodeResult.nodeId,
      });

      // Clean up temporary global
      await cdpClient.sendCommand(context.tabId, 'Runtime.evaluate', {
        expression: 'delete window.__claudeFileInputTarget',
      });

      return textResult(
        `Uploaded ${filePaths.length} file(s) to [${refId}]: ${filePaths.join(', ')}`,
      );
    } catch (err) {
      return errorResult(
        `File upload failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

export default fileUploadTool;

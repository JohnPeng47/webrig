/**
 * form_input — Set the value of a form element by its ref ID.
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

export const formInputTool: ToolDefinition = {
  name: 'form_input',
  description:
    'Set the value of a form input element identified by its ref ID. Works with text inputs, textareas, select elements, checkboxes, and radio buttons. Triggers appropriate change/input events.',
  parameters: {
    refId: {
      type: 'string',
      description:
        'The ref ID of the target element (e.g. "ref_12"), obtained from read_page or find.',
      required: true,
    },
    value: {
      type: 'string',
      description:
        'The value to set. For checkboxes/radios use "true"/"false". For select elements use the option value.',
      required: true,
    },
  },

  async execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const refId = args.refId as string;
    const value = args.value as string;

    if (!refId) {
      return errorResult('Missing required parameter: refId');
    }
    if (value == null) {
      return errorResult('Missing required parameter: value');
    }

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: context.tabId },
        func: (ref: string, val: string) => {
          if (!window.__claudeElementMap) {
            return { error: 'Element map not initialized. Use read_page first.' };
          }

          const weakRef = window.__claudeElementMap.get(ref);
          if (!weakRef) {
            return { error: `Element with ref "${ref}" not found in map.` };
          }

          const el = weakRef.deref();
          if (!el) {
            return {
              error: `Element with ref "${ref}" no longer exists on the page.`,
            };
          }

          const tag = el.tagName.toLowerCase();
          const inputType = el.getAttribute('type')?.toLowerCase() || '';

          if (tag === 'select') {
            const selectEl = el as HTMLSelectElement;
            selectEl.value = val;
            selectEl.dispatchEvent(new Event('change', { bubbles: true }));
            return { success: true, tag, value: selectEl.value };
          }

          if (tag === 'input' && (inputType === 'checkbox' || inputType === 'radio')) {
            const inputEl = el as HTMLInputElement;
            const shouldCheck = val === 'true' || val === '1';
            inputEl.checked = shouldCheck;
            inputEl.dispatchEvent(new Event('change', { bubbles: true }));
            return { success: true, tag, value: String(inputEl.checked) };
          }

          if (tag === 'input' || tag === 'textarea') {
            const inputEl = el as HTMLInputElement | HTMLTextAreaElement;
            // Use native setter to work with React/Vue controlled inputs
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
              tag === 'textarea'
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype,
              'value',
            )?.set;
            if (nativeInputValueSetter) {
              nativeInputValueSetter.call(inputEl, val);
            } else {
              inputEl.value = val;
            }
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            inputEl.dispatchEvent(new Event('change', { bubbles: true }));
            return { success: true, tag, value: inputEl.value };
          }

          // Contenteditable
          if (el.getAttribute('contenteditable') === 'true') {
            (el as HTMLElement).innerText = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            return { success: true, tag, value: val };
          }

          return { error: `Element <${tag}> is not a recognized form input.` };
        },
        args: [refId, value],
      });

      const result = results?.[0]?.result as
        | { success?: boolean; error?: string; tag?: string; value?: string }
        | undefined;

      if (!result) {
        return errorResult('No result from form_input script.');
      }

      if (result.error) {
        return errorResult(result.error);
      }

      return textResult(
        `Set <${result.tag}> [${refId}] value to "${result.value}"`,
      );
    } catch (err) {
      return errorResult(
        `Form input failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  toAnthropicSchema() {
    return buildAnthropicSchema(this);
  },
};

export default formInputTool;

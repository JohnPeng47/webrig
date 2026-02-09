declare global {
  interface Window {
    __generateAccessibilityTree: (
      filter?: string,
      depth?: number,
      charLimit?: number,
      refId?: string
    ) => { pageContent: string; viewport: { width: number; height: number }; error?: string };
    __claudeElementMap: Map<string, WeakRef<Element>>;
    __claudeRefCounter: number;
  }
}

(function () {
  // Initialize global state if not already present
  if (!window.__claudeElementMap) {
    window.__claudeElementMap = new Map<string, WeakRef<Element>>();
  }
  if (!window.__claudeRefCounter) {
    window.__claudeRefCounter = 0;
  }

  const ROLE_MAP: Record<string, string> = {
    a: 'link',
    button: 'button',
    select: 'combobox',
    textarea: 'textbox',
    h1: 'heading',
    h2: 'heading',
    h3: 'heading',
    h4: 'heading',
    h5: 'heading',
    h6: 'heading',
    img: 'image',
    nav: 'navigation',
    main: 'main',
    header: 'banner',
    footer: 'contentinfo',
    section: 'region',
    article: 'article',
    aside: 'complementary',
    form: 'form',
    table: 'table',
    ul: 'list',
    ol: 'list',
    li: 'listitem',
    label: 'label',
    dialog: 'dialog',
  };

  const SKIP_TAGS = new Set(['script', 'style', 'meta', 'link', 'title', 'noscript']);

  const INTERACTIVE_TAGS = new Set([
    'a',
    'button',
    'input',
    'select',
    'textarea',
    'details',
    'summary',
  ]);

  const LANDMARK_TAGS = new Set([
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'nav', 'main', 'header', 'footer',
    'section', 'article', 'aside',
  ]);

  function getRole(el: Element): string {
    const explicitRole = el.getAttribute('role');
    if (explicitRole) return explicitRole;

    const tag = el.tagName.toLowerCase();

    if (tag === 'input') {
      const inputType = el.getAttribute('type') || 'text';
      if (inputType === 'submit' || inputType === 'button') return 'button';
      if (inputType === 'checkbox') return 'checkbox';
      if (inputType === 'radio') return 'radio';
      if (inputType === 'file') return 'button';
      return 'textbox';
    }

    return ROLE_MAP[tag] || 'generic';
  }

  function getLabel(el: Element): string {
    const tag = el.tagName.toLowerCase();

    // For select elements, prioritize selected option text
    if (tag === 'select') {
      const selectEl = el as HTMLSelectElement;
      const selectedOption =
        selectEl.querySelector('option[selected]') ||
        selectEl.options[selectEl.selectedIndex];
      if (selectedOption && selectedOption.textContent) {
        return selectedOption.textContent.trim();
      }
    }

    // aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

    // placeholder
    const placeholder = el.getAttribute('placeholder');
    if (placeholder && placeholder.trim()) return placeholder.trim();

    // title
    const title = el.getAttribute('title');
    if (title && title.trim()) return title.trim();

    // alt
    const alt = el.getAttribute('alt');
    if (alt && alt.trim()) return alt.trim();

    // associated label[for=id]
    if (el.id) {
      const labelEl = document.querySelector('label[for="' + el.id + '"]');
      if (labelEl && labelEl.textContent && labelEl.textContent.trim()) {
        return labelEl.textContent.trim();
      }
    }

    // For inputs, show current value
    if (tag === 'input') {
      const inputEl = el as HTMLInputElement;
      const inputType = el.getAttribute('type') || '';
      const valueAttr = el.getAttribute('value');
      if (inputType === 'submit' && valueAttr && valueAttr.trim()) {
        return valueAttr.trim();
      }
      if (inputEl.value && inputEl.value.length < 50 && inputEl.value.trim()) {
        return inputEl.value.trim();
      }
    }

    // For buttons, links, summary - direct text content
    if (['button', 'a', 'summary'].includes(tag)) {
      let text = '';
      for (let i = 0; i < el.childNodes.length; i++) {
        const child = el.childNodes[i];
        if (child.nodeType === Node.TEXT_NODE) {
          text += child.textContent;
        }
      }
      if (text.trim()) return text.trim();
    }

    // For headings, use textContent (truncated)
    if (tag.match(/^h[1-6]$/)) {
      const headingText = el.textContent;
      if (headingText && headingText.trim()) {
        return headingText.trim().substring(0, 100);
      }
    }

    // For img with no alt, return empty
    if (tag === 'img') return '';

    // For other elements, try direct text nodes
    let directText = '';
    for (let i = 0; i < el.childNodes.length; i++) {
      const child = el.childNodes[i];
      if (child.nodeType === Node.TEXT_NODE) {
        directText += child.textContent;
      }
    }
    if (directText && directText.trim() && directText.trim().length >= 3) {
      const trimmed = directText.trim();
      return trimmed.length > 100 ? trimmed.substring(0, 100) + '...' : trimmed;
    }

    return '';
  }

  function isVisible(el: Element): boolean {
    const style = window.getComputedStyle(el);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      (el as HTMLElement).offsetWidth > 0 &&
      (el as HTMLElement).offsetHeight > 0
    );
  }

  function isInteractive(el: Element): boolean {
    const tag = el.tagName.toLowerCase();
    return (
      INTERACTIVE_TAGS.has(tag) ||
      el.getAttribute('onclick') !== null ||
      el.getAttribute('tabindex') !== null ||
      el.getAttribute('role') === 'button' ||
      el.getAttribute('role') === 'link' ||
      el.getAttribute('contenteditable') === 'true'
    );
  }

  function isLandmark(el: Element): boolean {
    const tag = el.tagName.toLowerCase();
    return LANDMARK_TAGS.has(tag) || el.getAttribute('role') !== null;
  }

  function shouldInclude(
    el: Element,
    opts: { filter: string; refId?: string }
  ): boolean {
    const tag = el.tagName.toLowerCase();

    // Skip unwanted tags
    if (SKIP_TAGS.has(tag)) return false;

    // SVG: skip unless has aria-label
    if (tag === 'svg' && !el.getAttribute('aria-label')) return false;

    // For non-"all" filter, check aria-hidden and visibility
    if (opts.filter !== 'all' && el.getAttribute('aria-hidden') === 'true') return false;
    if (opts.filter !== 'all' && !isVisible(el)) return false;

    // For non-"all" filter without refId, check viewport bounds
    if (opts.filter !== 'all' && !opts.refId) {
      const rect = el.getBoundingClientRect();
      if (
        !(
          rect.top < window.innerHeight &&
          rect.bottom > 0 &&
          rect.left < window.innerWidth &&
          rect.right > 0
        )
      ) {
        return false;
      }
    }

    // Interactive filter: only include interactive elements
    if (opts.filter === 'interactive') return isInteractive(el);

    // For default "all" filter, include if interactive, landmark, has label, or has meaningful role
    if (isInteractive(el)) return true;
    if (isLandmark(el)) return true;
    if (getLabel(el).length > 0) return true;

    const role = getRole(el);
    return role !== 'generic' && role !== 'image';
  }

  function findExistingRef(el: Element): string | null {
    for (const [refId, weakRef] of window.__claudeElementMap) {
      if (weakRef.deref() === el) {
        return refId;
      }
    }
    return null;
  }

  function assignRef(el: Element): string {
    const existing = findExistingRef(el);
    if (existing) return existing;

    const refId = 'ref_' + ++window.__claudeRefCounter;
    window.__claudeElementMap.set(refId, new WeakRef(el));
    return refId;
  }

  window.__generateAccessibilityTree = function (
    filter?: string,
    depth?: number,
    charLimit?: number,
    refId?: string
  ) {
    try {
      const lines: string[] = [];
      const maxDepth = depth ?? 15;
      const opts = { filter: filter || 'all', refId };

      function walk(el: Element, currentDepth: number): void {
        if (currentDepth > maxDepth) return;
        if (!el || !el.tagName) return;

        const included =
          shouldInclude(el, opts) || (refId != null && currentDepth === 0);

        if (included) {
          const role = getRole(el);
          let label = getLabel(el);
          const ref = assignRef(el);

          let line = '  '.repeat(currentDepth) + role;

          if (label) {
            label = label.replace(/\s+/g, ' ').substring(0, 100);
            line += ' "' + label.replace(/"/g, '\\"') + '"';
          }

          line += ' [' + ref + ']';

          // Add extra attributes for context
          const href = el.getAttribute('href');
          if (href) line += ' href="' + href + '"';

          const type = el.getAttribute('type');
          if (type) line += ' type="' + type + '"';

          const placeholderAttr = el.getAttribute('placeholder');
          if (placeholderAttr) line += ' placeholder="' + placeholderAttr + '"';

          lines.push(line);

          // For select elements, enumerate options as children
          if (el.tagName.toLowerCase() === 'select') {
            const selectEl = el as HTMLSelectElement;
            for (let i = 0; i < selectEl.options.length; i++) {
              const option = selectEl.options[i];
              let optLine = '  '.repeat(currentDepth + 1) + 'option';

              let optText = option.textContent ? option.textContent.trim() : '';
              if (optText) {
                optText = optText.replace(/\s+/g, ' ').substring(0, 100);
                optLine += ' "' + optText.replace(/"/g, '\\"') + '"';
              }

              if (option.selected) {
                optLine += ' (selected)';
              }

              if (option.value && option.value !== optText) {
                optLine += ' value="' + option.value.replace(/"/g, '\\"') + '"';
              }

              lines.push(optLine);
            }
          }
        }

        // Recurse into children
        if (el.children && currentDepth < maxDepth) {
          for (let i = 0; i < el.children.length; i++) {
            walk(el.children[i], included ? currentDepth + 1 : currentDepth);
          }
        }
      }

      // Handle refId-based subtree
      if (refId) {
        const weakRef = window.__claudeElementMap.get(refId);
        if (!weakRef) {
          return {
            error:
              "Element with ref_id '" +
              refId +
              "' not found. It may have been removed from the page. Use read_page without ref_id to get the current page state.",
            pageContent: '',
            viewport: { width: window.innerWidth, height: window.innerHeight },
          };
        }
        const el = weakRef.deref();
        if (!el) {
          return {
            error:
              "Element with ref_id '" +
              refId +
              "' no longer exists. It may have been removed from the page. Use read_page without ref_id to get the current page state.",
            pageContent: '',
            viewport: { width: window.innerWidth, height: window.innerHeight },
          };
        }
        walk(el, 0);
      } else if (document.body) {
        walk(document.body, 0);
      }

      // Clean up stale WeakRefs
      for (const [key, weakRef] of window.__claudeElementMap) {
        if (!weakRef.deref()) {
          window.__claudeElementMap.delete(key);
        }
      }

      const output = lines.join('\n');

      // Check character limit
      if (charLimit != null && output.length > charLimit) {
        let errorMsg =
          'Output exceeds ' +
          charLimit +
          ' character limit (' +
          output.length +
          ' characters). ';

        if (refId) {
          errorMsg +=
            'The specified element has too much content. Try specifying a smaller depth parameter or focus on a more specific child element.';
        } else if (depth !== undefined) {
          errorMsg +=
            'Try specifying an even smaller depth parameter or use ref_id to focus on a specific element.';
        } else {
          errorMsg +=
            'Try specifying a depth parameter (e.g., depth: 5) or use ref_id to focus on a specific element from the page.';
        }

        return {
          error: errorMsg,
          pageContent: '',
          viewport: { width: window.innerWidth, height: window.innerHeight },
        };
      }

      return {
        pageContent: output,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Unknown error';
      throw new Error('Error generating accessibility tree: ' + message);
    }
  };
})();

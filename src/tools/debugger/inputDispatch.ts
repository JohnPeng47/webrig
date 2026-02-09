/**
 * Input dispatch — high-level helpers for mouse and keyboard input
 * via the Chrome Debugger Protocol's `Input.dispatch*` commands.
 */

import { cdpClient } from './cdpClient';

// ═══════════════════════════════════════════════════════════════════
// Key-code map
// ═══════════════════════════════════════════════════════════════════

/**
 * Map of human-readable key names to Windows virtual-key codes.
 * Used by `pressKey` and `dispatchKeyEvent`.
 */
const KEY_CODES: Record<string, number> = {
  // Navigation / editing
  Backspace: 8,
  Tab: 9,
  Enter: 13,
  Escape: 27,
  Space: 32,
  PageUp: 33,
  PageDown: 34,
  End: 35,
  Home: 36,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  Delete: 46,
  Insert: 45,

  // Digits 0-9
  '0': 48, '1': 49, '2': 50, '3': 51, '4': 52,
  '5': 53, '6': 54, '7': 55, '8': 56, '9': 57,

  // Letters a-z (virtual key codes use upper-case)
  a: 65, b: 66, c: 67, d: 68, e: 69,
  f: 70, g: 71, h: 72, i: 73, j: 74,
  k: 75, l: 76, m: 77, n: 78, o: 79,
  p: 80, q: 81, r: 82, s: 83, t: 84,
  u: 85, v: 86, w: 87, x: 88, y: 89,
  z: 90,

  // Function keys
  F1: 112, F2: 113, F3: 114, F4: 115,
  F5: 116, F6: 117, F7: 118, F8: 119,
  F9: 120, F10: 121, F11: 122, F12: 123,

  // Modifier keys (included for completeness; also used as standalone)
  Shift: 16,
  Control: 17,
  Alt: 18,
  Meta: 91,
};

/**
 * Look up the Windows virtual-key code for a named key.
 *
 * The lookup is case-insensitive for single-letter keys (a-z) and
 * also handles common aliases like `Ctrl` -> `Control`.
 */
export function getVirtualKeyCode(key: string): number {
  // Normalise common aliases
  const normalised = normaliseKeyName(key);

  const code = KEY_CODES[normalised];
  if (code != null) return code;

  // If the key is a single printable character, use its char code.
  if (normalised.length === 1) {
    return normalised.toUpperCase().charCodeAt(0);
  }

  // Unknown key — return 0 so callers can decide how to handle it.
  console.warn(`[inputDispatch] Unknown key name: "${key}"`);
  return 0;
}

// ═══════════════════════════════════════════════════════════════════
// Modifier helpers
// ═══════════════════════════════════════════════════════════════════

/** Modifier bit-field values used by CDP Input.dispatch* commands. */
const MODIFIER_BIT = {
  Alt: 1,
  Control: 2,
  Meta: 4,
  Shift: 8,
} as const;

/** Names recognised as modifiers when parsing key combinations. */
const MODIFIER_NAMES = new Set(['Alt', 'Control', 'Ctrl', 'Meta', 'Shift', 'Command', 'Cmd']);

/** Convert an alias to the canonical CDP modifier name. */
function canonicalModifier(name: string): 'Alt' | 'Control' | 'Meta' | 'Shift' {
  const lower = name.toLowerCase();
  if (lower === 'ctrl' || lower === 'control') return 'Control';
  if (lower === 'cmd' || lower === 'command' || lower === 'meta') return 'Meta';
  if (lower === 'shift') return 'Shift';
  if (lower === 'alt') return 'Alt';
  return 'Control'; // fallback
}

/** Normalise a key name: handle case-insensitive single letters and aliases. */
function normaliseKeyName(key: string): string {
  if (key.length === 1 && /^[a-zA-Z]$/.test(key)) {
    return key.toLowerCase();
  }
  // Handle aliases
  if (key.toLowerCase() === 'ctrl') return 'Control';
  if (key.toLowerCase() === 'cmd' || key.toLowerCase() === 'command') return 'Meta';
  if (key.toLowerCase() === 'esc') return 'Escape';
  if (key.toLowerCase() === 'del') return 'Delete';
  if (key.toLowerCase() === 'ins') return 'Insert';
  if (key.toLowerCase() === 'return') return 'Enter';
  if (key === ' ') return 'Space';
  return key;
}

// ═══════════════════════════════════════════════════════════════════
// Mouse events
// ═══════════════════════════════════════════════════════════════════

/** Parameters for `dispatchMouseEvent`. */
export interface MouseEventParams {
  type: 'mousePressed' | 'mouseReleased' | 'mouseMoved';
  x: number;
  y: number;
  button?: 'left' | 'right' | 'middle';
  clickCount?: number;
  /** Modifier bit-field: 1=Alt, 2=Ctrl, 4=Meta, 8=Shift */
  modifiers?: number;
}

/**
 * Dispatch a single mouse event via `Input.dispatchMouseEvent`.
 */
export async function dispatchMouseEvent(
  tabId: number,
  params: MouseEventParams,
): Promise<void> {
  await cdpClient.sendCommand(tabId, 'Input.dispatchMouseEvent', {
    type: params.type,
    x: params.x,
    y: params.y,
    button: params.button ?? 'left',
    clickCount: params.clickCount ?? 1,
    modifiers: params.modifiers ?? 0,
  });
}

/** Options shared by the high-level click helpers. */
export interface ClickOptions {
  button?: 'left' | 'right' | 'middle';
  clickCount?: number;
  /** Modifier bit-field: 1=Alt, 2=Ctrl, 4=Meta, 8=Shift */
  modifiers?: number;
}

/**
 * Perform a complete click (mousePressed + mouseReleased) at (x, y).
 */
export async function click(
  tabId: number,
  x: number,
  y: number,
  options?: ClickOptions,
): Promise<void> {
  const button = options?.button ?? 'left';
  const clickCount = options?.clickCount ?? 1;
  const modifiers = options?.modifiers ?? 0;

  await dispatchMouseEvent(tabId, {
    type: 'mousePressed',
    x,
    y,
    button,
    clickCount,
    modifiers,
  });

  await dispatchMouseEvent(tabId, {
    type: 'mouseReleased',
    x,
    y,
    button,
    clickCount,
    modifiers,
  });
}

/** Double-click at (x, y). */
export async function doubleClick(
  tabId: number,
  x: number,
  y: number,
): Promise<void> {
  await click(tabId, x, y, { clickCount: 2 });
}

/** Triple-click at (x, y) — typically selects a line or paragraph. */
export async function tripleClick(
  tabId: number,
  x: number,
  y: number,
): Promise<void> {
  await click(tabId, x, y, { clickCount: 3 });
}

/** Right-click (context menu) at (x, y). */
export async function rightClick(
  tabId: number,
  x: number,
  y: number,
): Promise<void> {
  await click(tabId, x, y, { button: 'right' });
}

/**
 * Mouse drag from (startX, startY) to (endX, endY).
 *
 * Sends: mousePressed at start -> mouseMoved to end -> mouseReleased at end.
 */
export async function drag(
  tabId: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): Promise<void> {
  await dispatchMouseEvent(tabId, {
    type: 'mousePressed',
    x: startX,
    y: startY,
    button: 'left',
  });

  await dispatchMouseEvent(tabId, {
    type: 'mouseMoved',
    x: endX,
    y: endY,
    button: 'left',
  });

  await dispatchMouseEvent(tabId, {
    type: 'mouseReleased',
    x: endX,
    y: endY,
    button: 'left',
  });
}

/** Hover (move the mouse without clicking) to (x, y). */
export async function hover(
  tabId: number,
  x: number,
  y: number,
): Promise<void> {
  await dispatchMouseEvent(tabId, {
    type: 'mouseMoved',
    x,
    y,
  });
}

/**
 * Scroll at position (x, y) by (deltaX, deltaY) pixels.
 *
 * Positive deltaY scrolls down; positive deltaX scrolls right.
 */
export async function scroll(
  tabId: number,
  x: number,
  y: number,
  deltaX: number,
  deltaY: number,
): Promise<void> {
  await cdpClient.sendCommand(tabId, 'Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x,
    y,
    deltaX,
    deltaY,
    modifiers: 0,
  });
}

// ═══════════════════════════════════════════════════════════════════
// Keyboard events
// ═══════════════════════════════════════════════════════════════════

/** Parameters for `dispatchKeyEvent`. */
export interface KeyEventParams {
  type: 'keyDown' | 'keyUp' | 'char';
  key?: string;
  code?: string;
  text?: string;
  windowsVirtualKeyCode?: number;
  modifiers?: number;
}

/**
 * Dispatch a single keyboard event via `Input.dispatchKeyEvent`.
 */
export async function dispatchKeyEvent(
  tabId: number,
  params: KeyEventParams,
): Promise<void> {
  await cdpClient.sendCommand(tabId, 'Input.dispatchKeyEvent', {
    type: params.type,
    key: params.key,
    code: params.code,
    text: params.text,
    windowsVirtualKeyCode: params.windowsVirtualKeyCode ?? 0,
    modifiers: params.modifiers ?? 0,
  });
}

/**
 * Type a text string by sending `Input.insertText`.
 *
 * This is the most efficient way to input text because it bypasses
 * individual keyDown/keyUp events and handles Unicode correctly.
 */
export async function typeText(tabId: number, text: string): Promise<void> {
  await cdpClient.sendCommand(tabId, 'Input.insertText', { text });
}

/**
 * Press a key or key combination.
 *
 * Accepts plain key names (`Enter`, `a`, `F5`) and modifier combos
 * separated by `+` (`Control+a`, `Control+Shift+Delete`,
 * `Meta+c`).
 *
 * Common aliases are supported: `Ctrl`, `Cmd`, `Command`, `Esc`,
 * `Del`, `Return`.
 *
 * For each modifier the sequence is:
 *   keyDown(modifier) -> keyDown(main) -> keyUp(main) -> keyUp(modifier)
 */
export async function pressKey(tabId: number, key: string): Promise<void> {
  const parts = key.split('+').map((s) => s.trim());

  // Separate modifiers from the main key
  const modifierParts: string[] = [];
  let mainKey = '';

  for (const part of parts) {
    if (MODIFIER_NAMES.has(part) || MODIFIER_NAMES.has(part.charAt(0).toUpperCase() + part.slice(1))) {
      modifierParts.push(part);
    } else {
      mainKey = part;
    }
  }

  // If no explicit main key was found (e.g. user just sent "Shift"),
  // treat the last part as the main key.
  if (!mainKey && modifierParts.length > 0) {
    mainKey = modifierParts.pop()!;
  }

  // Build the modifier bit-field
  let modifiers = 0;
  for (const mod of modifierParts) {
    const canonical = canonicalModifier(mod);
    modifiers |= MODIFIER_BIT[canonical];
  }

  const normalisedMain = normaliseKeyName(mainKey);
  const mainVkCode = getVirtualKeyCode(normalisedMain);

  // Determine the text to send with keyDown — single printable chars
  // need a `text` field so the browser actually inserts them.
  const isChar = normalisedMain.length === 1 && mainVkCode >= 32;
  const text = isChar ? normalisedMain : undefined;

  // Build the `code` value (e.g. "KeyA", "Enter", "Digit1")
  const code = buildCodeValue(normalisedMain);

  // Press modifiers down
  for (const mod of modifierParts) {
    const canonical = canonicalModifier(mod);
    await dispatchKeyEvent(tabId, {
      type: 'keyDown',
      key: canonical,
      code: canonical + 'Left', // e.g. "ControlLeft"
      windowsVirtualKeyCode: getVirtualKeyCode(canonical),
      modifiers,
    });
  }

  // Main key down
  await dispatchKeyEvent(tabId, {
    type: 'keyDown',
    key: normalisedMain.length === 1 ? normalisedMain : normalisedMain,
    code,
    text,
    windowsVirtualKeyCode: mainVkCode,
    modifiers,
  });

  // Main key up
  await dispatchKeyEvent(tabId, {
    type: 'keyUp',
    key: normalisedMain.length === 1 ? normalisedMain : normalisedMain,
    code,
    windowsVirtualKeyCode: mainVkCode,
    modifiers,
  });

  // Release modifiers (in reverse order)
  for (let i = modifierParts.length - 1; i >= 0; i--) {
    const canonical = canonicalModifier(modifierParts[i]);
    // Recalculate modifiers without this one
    modifiers &= ~MODIFIER_BIT[canonical];
    await dispatchKeyEvent(tabId, {
      type: 'keyUp',
      key: canonical,
      code: canonical + 'Left',
      windowsVirtualKeyCode: getVirtualKeyCode(canonical),
      modifiers,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

/**
 * Build the DOM `code` value for a key name.
 *
 * Examples: 'a' -> 'KeyA', '1' -> 'Digit1', 'Enter' -> 'Enter',
 * 'F5' -> 'F5', 'Space' -> 'Space'.
 */
function buildCodeValue(key: string): string {
  // Single letter
  if (key.length === 1 && /^[a-z]$/i.test(key)) {
    return 'Key' + key.toUpperCase();
  }
  // Single digit
  if (key.length === 1 && /^[0-9]$/.test(key)) {
    return 'Digit' + key;
  }
  // Named keys already have the right code
  return key;
}

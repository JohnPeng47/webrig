/**
 * Screenshot capture — uses the Chrome Debugger Protocol
 * `Page.captureScreenshot` method to grab the visible viewport.
 */

import { cdpClient } from './cdpClient';

/** Options for configuring the screenshot output. */
export interface ScreenshotOptions {
  /** Image format.  Defaults to `'png'`. */
  format?: 'png' | 'jpeg' | 'webp';
  /**
   * Compression quality (0-100).  Only applies to `'jpeg'` and
   * `'webp'` formats.  Ignored for `'png'`.
   */
  quality?: number;
}

/**
 * Capture a screenshot of the visible viewport of the given tab.
 *
 * 1. Ensures the debugger is attached (auto-attaches if needed).
 * 2. Sends `Page.captureScreenshot` with the requested format/quality.
 * 3. Returns the raw base-64 encoded image data.
 *
 * @param tabId    Chrome tab to screenshot.
 * @param options  Optional format and quality settings.
 * @returns        Base-64 encoded image data (no data-URL prefix).
 */
export async function captureScreenshot(
  tabId: number,
  options?: ScreenshotOptions,
): Promise<string> {
  const format = options?.format ?? 'png';

  const cdpParams: Record<string, unknown> = { format };

  // quality is only meaningful for lossy formats
  if ((format === 'jpeg' || format === 'webp') && options?.quality != null) {
    // Clamp to the valid 0-100 range
    cdpParams.quality = Math.max(0, Math.min(100, options.quality));
  }

  const result = await cdpClient.sendCommand(
    tabId,
    'Page.captureScreenshot',
    cdpParams,
  );

  if (!result || typeof result.data !== 'string') {
    throw new Error(
      'Page.captureScreenshot returned an unexpected result: ' +
        JSON.stringify(result),
    );
  }

  return result.data;
}

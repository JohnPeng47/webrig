/**
 * Offscreen Document Manager
 *
 * Creates and manages the offscreen document used for audio playback
 * and GIF rendering.
 */

const LOG_PREFIX = '[OffscreenManager]';

let creating: Promise<void> | null = null;

/**
 * Ensure the offscreen document exists. If it doesn't, create it.
 */
async function ensureOffscreenDocument(): Promise<void> {
  // Check if one already exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });

  if (existingContexts.length > 0) {
    return;
  }

  // Avoid race conditions with concurrent calls
  if (creating) {
    await creating;
    return;
  }

  creating = chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: [
      chrome.offscreen.Reason.AUDIO_PLAYBACK,
      chrome.offscreen.Reason.DOM_PARSER,
    ],
    justification: 'Audio playback and GIF rendering',
  });

  try {
    await creating;
    console.log(`${LOG_PREFIX} Offscreen document created`);
  } finally {
    creating = null;
  }
}

/**
 * Play a notification sound via the offscreen document.
 */
export async function playNotificationSound(
  audioUrl: string,
  volume?: number,
): Promise<void> {
  try {
    await ensureOffscreenDocument();
    await chrome.runtime.sendMessage({
      type: 'PLAY_NOTIFICATION_SOUND',
      target: 'offscreen',
      audioUrl,
      volume: volume ?? 0.5,
    });
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to play notification sound:`, err);
  }
}

/**
 * Generate a GIF via the offscreen document.
 */
export async function generateGif(
  frames: Array<{ data: string; delay: number }>,
): Promise<string | null> {
  try {
    await ensureOffscreenDocument();
    const result = await chrome.runtime.sendMessage({
      type: 'GENERATE_GIF',
      target: 'offscreen',
      frames,
    });
    return (result as { data?: string })?.data ?? null;
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to generate GIF:`, err);
    return null;
  }
}

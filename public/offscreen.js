// Offscreen document script — handles audio playback and GIF rendering.

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target !== 'offscreen') return;

  if (message.type === 'PLAY_NOTIFICATION_SOUND') {
    const audio = new Audio(message.audioUrl);
    audio.volume = message.volume ?? 0.5;
    audio.play()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'GENERATE_GIF') {
    // GIF generation stub — requires gif.js vendored library
    console.log('[Offscreen] GIF generation requested');
    sendResponse({ success: false, error: 'GIF generation not yet implemented' });
    return true;
  }
});

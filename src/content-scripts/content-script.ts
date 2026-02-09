// Content script for claude.ai — handles onboarding button clicks.
// In headless mode, the open_side_panel message is logged but no panel opens.

(function () {
  document.body.addEventListener('click', (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const button = target.closest('#claude-onboarding-button') as HTMLElement | null;

    if (button) {
      const prompt = button.getAttribute('data-task-prompt');
      if (prompt) {
        console.log('[ContentScript] Onboarding button clicked, prompt:', prompt);
        chrome.runtime.sendMessage({
          type: 'open_side_panel',
          prompt,
        });
      }
    }
  });
})();

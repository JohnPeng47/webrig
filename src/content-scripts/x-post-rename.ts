/**
 * Test plugin: renames the "Post" button on x.com to "Spew Bullshit".
 */
(function () {
  function renamePostButtons(): void {
    // The Post button uses a span inside a button with specific test IDs / text
    const spans = document.querySelectorAll('span');
    for (const span of spans) {
      if (span.textContent?.trim() === 'Post' && !span.dataset.renamed) {
        span.textContent = 'Spew Bullshit';
        span.dataset.renamed = 'true';
      }
    }
  }

  // Run immediately
  renamePostButtons();

  // X is a SPA — observe DOM mutations for dynamically rendered elements
  const observer = new MutationObserver(() => {
    renamePostButtons();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
})();

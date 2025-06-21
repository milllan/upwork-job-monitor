// Create a namespace for UI helpers to avoid polluting the global scope.
window.UJM_UI = {
  /**
   * Initializes scroll hint shadows for a scrollable list within a container.
   * A top shadow appears when scrolled down, and a bottom shadow disappears when scrolled to the end.
   * @param {HTMLElement} containerEl The container element that will have the pseudo-elements for shadows.
   * @param {HTMLElement} listEl The scrollable list element inside the container.
   */
  initializeScrollHints: function(containerEl, listEl) {
    if (!containerEl || !listEl) {
      console.warn("Scroll hints not initialized: container or list element not found.");
      return;
    }

    const updateHints = () => {
      // Top shadow: visible only if scrolled down from the top
      const isScrolledFromTop = listEl.scrollTop > 10;
      containerEl.classList.toggle('job-list-container--scrolled', isScrolledFromTop);

      // Bottom shadow: hidden if scrolled to the very end (or if not scrollable)
      const isScrolledToEnd = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 1;
      containerEl.classList.toggle('job-list-container--scrolled-to-end', isScrolledToEnd);
    };

    // Add scroll listener to update hints dynamically
    listEl.addEventListener('scroll', updateHints);

    // Use a MutationObserver to update hints when the list content changes (e.g., jobs are added/removed).
    const observer = new MutationObserver(updateHints);
    observer.observe(listEl, { childList: true, subtree: true });

    updateHints(); // Initial check
  }
};


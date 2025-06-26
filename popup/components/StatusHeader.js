/**
 * StatusHeader Component
 * Manages the display of the application's status, including the monitor state,
 * last check time, and deleted jobs count.
 */
class StatusHeader {
  constructor(containerElement) {
    if (!containerElement) {
      throw new Error('StatusHeader component requires a container element.');
    }
    this.container = containerElement;
    this.state = {
      statusText: 'Initializing...',
      lastCheckTimestamp: null,
      deletedJobsCount: 0,
    };
    this.render();
  }

  /**
   * Updates the header's state and re-renders the display.
   * @param {object} newState - An object with partial state to update.
   */
  update(newState = {}) {
    // Merge new state with the current state
    this.state = { ...this.state, ...newState };
    this.render();
  }

  /**
   * Renders the header's content based on the current state.
   */
  render() {
    const { statusText, lastCheckTimestamp, deletedJobsCount } = this.state;

    const statusDisplay = statusText || 'Idle';
    const deletedCount = deletedJobsCount || 0;
    let lastCheckDisplay = 'N/A';

    if (lastCheckTimestamp) {
      const lastCheckDate = new Date(lastCheckTimestamp);
      const timeString = lastCheckDate.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      // timeAgo function is expected to be globally available from utils.js
      lastCheckDisplay = `${timeString} (${timeAgo(lastCheckDate)})`;
    }

    this.container.innerHTML =
      `<span class="app-header__status-tag" title="Current monitor status">${statusDisplay}</span>` +
      `<span class="app-header__status-tag" title="Last successful check time">Last: ${lastCheckDisplay}</span>` +
      `<span class="app-header__status-tag" title="Jobs you've deleted from the list">Del: ${deletedCount}</span>`;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StatusHeader;
} else {
  window.StatusHeader = StatusHeader;
}

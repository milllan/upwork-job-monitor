import { timeAgo } from '../../utils/utils.js';

interface StatusHeaderState {
  statusText: string;
  lastCheckTimestamp: number | null;
  deletedJobsCount: number;
}

export class StatusHeader {
  private container: HTMLElement;
  private state: StatusHeaderState;

  constructor(containerElement: HTMLElement) {
    // containerElement is expected to be a valid HTMLElement; keep guard for robustness without changing logic.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- DOM can supply undefined during early initialization
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

  update(newState: Partial<StatusHeaderState>): void {
    this.state = { ...this.state, ...newState };
    this.render();
  }

  render(): void {
    const { statusText, lastCheckTimestamp, deletedJobsCount } = this.state;

    const statusDisplay = statusText || 'Idle';
    const deletedCount = deletedJobsCount;
    let lastCheckDisplay = 'N/A';

    if (typeof lastCheckTimestamp === 'number' && Number.isFinite(lastCheckTimestamp)) {
      const lastCheckDate = new Date(lastCheckTimestamp);
      const timeString = lastCheckDate.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      lastCheckDisplay = `${timeString} (${timeAgo(lastCheckDate)})`;
    }

    // Read extension version from manifest at runtime; guard for robustness in popup lifecycle
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- `browser` may be undefined in some browsers/early lifecycle
    const version = typeof browser !== 'undefined' && browser?.runtime?.getManifest
      ? browser.runtime.getManifest().version
      : '';

    // If popup has a title link container, append version there; otherwise prepend a small version badge.
    const titleLink = document.querySelector('.app-header__title a, .app-header__title-link');
    // Guard DOM presence in popup lifecycle (runtime variability during fast open/close)
    if (titleLink) {
      // Ensure we don't duplicate the version element on re-render
      const parentEl = (titleLink as HTMLElement).parentElement;
      // DOM parent may be absent depending on markup; TS can't narrow through DOM ops reliably
      let existing = parentEl?.querySelector('.app-header__version');
      if (!existing) {
        const span = document.createElement('span');
        span.className = 'app-header__version';
        span.setAttribute('title', 'Extension version');
        span.style.marginLeft = '8px';
        span.style.opacity = '0.8';
        span.style.fontSize = '0.85em';
        (titleLink as HTMLElement).insertAdjacentElement('afterend', span);
        existing = span;
      }
      // existing may be null when DOM changes between renders
      if (existing) {
        existing.textContent = `v${version}`;
      }
    } else {
      // Fallback: render a small version badge at the beginning of the container
      const versionBadge = version ? `<span class="app-header__version" title="Extension version" style="margin-right:8px;opacity:0.8;font-size:0.85em;">v${version}</span>` : '';
      this.container.innerHTML =
        versionBadge +
        `<span class="app-header__status-tag" title="Current monitor status">${statusDisplay}</span>` +
        `<span class="app-header__status-tag" title="Last successful check time">Last: ${lastCheckDisplay}</span>` +
        `<span class="app-header__status-tag" title="Jobs you've deleted from the list">Del: ${deletedCount}</span>`;
      return;
    }

    // Default render when title exists separately; keep existing status tags rendering
    this.container.innerHTML =
      `<span class="app-header__status-tag" title="Current monitor status">${statusDisplay}</span>` +
      `<span class="app-header__status-tag" title="Last successful check time">Last: ${lastCheckDisplay}</span>` +
      `<span class="app-header__status-tag" title="Jobs you've deleted from the list">Del: ${deletedCount}</span>`;
  }
}

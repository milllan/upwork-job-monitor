import { timeAgo } from '../../utils.ts';

interface StatusHeaderState {
  statusText: string;
  lastCheckTimestamp: number | null;
  deletedJobsCount: number;
}

export class StatusHeader {
  private container: HTMLElement;
  private state: StatusHeaderState;

  constructor(containerElement: HTMLElement) {
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
    const deletedCount = deletedJobsCount || 0;
    let lastCheckDisplay = 'N/A';

    if (lastCheckTimestamp) {
      const lastCheckDate = new Date(lastCheckTimestamp);
      const timeString = lastCheckDate.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      lastCheckDisplay = `${timeString} (${timeAgo(lastCheckDate)})`;
    }

    this.container.innerHTML =
      `<span class="app-header__status-tag" title="Current monitor status">${statusDisplay}</span>` +
      `<span class="app-header__status-tag" title="Last successful check time">Last: ${lastCheckDisplay}</span>` +
      `<span class="app-header__status-tag" title="Jobs you've deleted from the list">Del: ${deletedCount}</span>`;
  }
}

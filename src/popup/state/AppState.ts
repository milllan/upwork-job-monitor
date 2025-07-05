import { StorageManager } from '../../storage/storage-manager.js';
import { config } from '../../background/config.js';

// Define interfaces for state and other complex types
import { Job, JobDetails as JobDetailsType } from '../../types.js';

interface JobDetail extends JobDetailsType {}

interface State {
  theme: 'light' | 'dark';
  selectedJobId: string | null;
  collapsedJobIds: Set<string>;
  deletedJobIds: Set<string>;
  monitorStatus: string;
  lastCheckTimestamp: number | null;
  currentUserQuery: string;
  jobs: Job[];
  jobDetailsCache: Map<string, { data: JobDetail; timestamp: number }>;
  jobComponents: Map<string, any>; // Consider a more specific component type
  cacheExpiryMs: number;
}

export class AppState {
  private state: State;
  private listeners: Set<(newState: State, prevState: State) => void> = new Set();
  private selectorListeners: Map<keyof State, Set<(newValue: any, prevValue: any) => void>> = new Map();
  private debouncedSave: () => void;

  constructor() {
    this.state = {
      theme: 'light',
      selectedJobId: null,
      collapsedJobIds: new Set(),
      deletedJobIds: new Set(),
      monitorStatus: 'Initializing...',
      lastCheckTimestamp: null,
      currentUserQuery: '',
      jobs: [],
      jobDetailsCache: new Map(),
      jobComponents: new Map(),
      cacheExpiryMs: 15 * 60 * 1000, // 15 minutes
    };

    this.debouncedSave = this._debounce(this._saveToStorage.bind(this), 300);
  }

  // === Core State Management ===

  getState(): State {
    return { ...this.state };
  }

  setState(updates: Partial<State>, options: { skipPersistence?: boolean } = {}): void {
    const prevState = { ...this.state };
    const processedUpdates = this._processStateUpdates(updates);
    this.state = { ...this.state, ...processedUpdates };
    this._notifyListeners(this.state, prevState);

    if (!options.skipPersistence) {
      this.debouncedSave();
    }

    console.log('AppState: State updated', { updates, newState: this.state });
  }

  subscribe(listener: (newState: State, prevState: State) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeToSelector<K extends keyof State>(
    selector: K,
    listener: (newValue: State[K], prevValue: State[K]) => void
  ): () => void {
    if (!this.selectorListeners.has(selector)) {
      this.selectorListeners.set(selector, new Set());
    }
    this.selectorListeners.get(selector)!.add(listener);

    return () => {
      const listeners = this.selectorListeners.get(selector);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.selectorListeners.delete(selector);
        }
      }
    };
  }

  // === State Getters ===

  getTheme(): 'light' | 'dark' {
    return this.state.theme;
  }

  getSelectedJobId(): string | null {
    return this.state.selectedJobId;
  }

  getCollapsedJobIds(): Set<string> {
    return new Set(this.state.collapsedJobIds);
  }

  getDeletedJobIds(): Set<string> {
    return new Set(this.state.deletedJobIds);
  }

  getMonitorStatus(): string {
    return this.state.monitorStatus;
  }

  getLastCheckTimestamp(): number | null {
    return this.state.lastCheckTimestamp;
  }

  getCurrentUserQuery(): string {
    return this.state.currentUserQuery;
  }

  getJobs(): Job[] {
    return [...this.state.jobs];
  }

  getJobComponents(): Map<string, any> {
    return new Map(this.state.jobComponents);
  }

  getDeletedJobsCount(): number {
    return this.state.deletedJobIds.size;
  }

  getVisibleJobs(): Job[] {
    return this.state.jobs.filter((job) => !this.state.deletedJobIds.has(job.id));
  }

  // === State Actions ===

  setTheme(theme: 'light' | 'dark'): void {
    if (theme !== 'light' && theme !== 'dark') {
      console.warn('AppState: Invalid theme', theme);
      return;
    }
    this.setState({ theme });
  }

  setSelectedJobId(jobId: string | null): void {
    this.setState({ selectedJobId: jobId });
  }

  toggleJobCollapse(jobId: string): void {
    const collapsedJobIds = new Set(this.state.collapsedJobIds);
    if (collapsedJobIds.has(jobId)) {
      collapsedJobIds.delete(jobId);
    } else {
      collapsedJobIds.add(jobId);
    }
    this.setState({ collapsedJobIds });
  }

  deleteJob(jobId: string): void {
    const deletedJobIds = new Set(this.state.deletedJobIds);
    deletedJobIds.add(jobId);
    const selectedJobId = this.state.selectedJobId === jobId ? null : this.state.selectedJobId;
    this.setState({ deletedJobIds, selectedJobId });
  }

  updateMonitorStatus(status: string, timestamp: number | null = null): void {
    const updates: Partial<State> = { monitorStatus: status };
    if (timestamp !== null) {
      updates.lastCheckTimestamp = timestamp;
    }
    this.setState(updates);
  }

  setJobs(jobs: Job[]): void {
    this.setState({ jobs: [...jobs] });
  }

  setCurrentUserQuery(query: string): void {
    this.setState({ currentUserQuery: query });
  }

  // === Job Details Cache Management ===

  getCachedJobDetails(ciphertext: string): JobDetail | null {
    const cached = this.state.jobDetailsCache.get(ciphertext);
    if (!cached) {
      return null;
    }

    if (Date.now() - cached.timestamp >= this.state.cacheExpiryMs) {
      const jobDetailsCache = new Map(this.state.jobDetailsCache);
      jobDetailsCache.delete(ciphertext);
      this.setState({ jobDetailsCache }, { skipPersistence: true });
      return null;
    }

    return cached.data;
  }

  setCachedJobDetails(ciphertext: string, data: JobDetail): void {
    const jobDetailsCache = new Map(this.state.jobDetailsCache);
    jobDetailsCache.set(ciphertext, { data, timestamp: Date.now() });
    this.setState({ jobDetailsCache }, { skipPersistence: true });
  }

  // === Component Management ===

  setJobComponent(jobId: string, component: any): void {
    const jobComponents = new Map(this.state.jobComponents);
    jobComponents.set(jobId, component);
    this.setState({ jobComponents }, { skipPersistence: true });
  }

  removeJobComponent(jobId: string): void {
    const jobComponents = new Map(this.state.jobComponents);
    jobComponents.delete(jobId);
    this.setState({ jobComponents }, { skipPersistence: true });
  }

  clearJobComponents(): void {
    const currentComponents = this.getJobComponents();
    currentComponents.forEach((component) => {
      if (component && typeof component.destroy === 'function') {
        component.destroy();
      }
    });
    this.setState({ jobComponents: new Map() }, { skipPersistence: true });
  }

  // === Persistence ===

  async loadFromStorage(): Promise<void> {
    console.log('AppState: Attempting to load from storage.');
    try {
      const [
        theme,
        collapsedJobIds,
        deletedJobIds,
        monitorStatus,
        lastCheckTimestamp,
        currentUserQuery,
        jobs,
      ] = await Promise.all([
        StorageManager.getUiTheme(),
        StorageManager.getCollapsedJobIds(),
        StorageManager.getDeletedJobIds(),
        StorageManager.getMonitorStatus(),
        StorageManager.getLastCheckTimestamp(),
        StorageManager.getCurrentUserQuery(),
        StorageManager.getRecentFoundJobs(),
      ]);

      this.setState(
        {
          theme: theme as 'light' | 'dark',
          collapsedJobIds: new Set(collapsedJobIds),
          deletedJobIds: new Set(deletedJobIds),
          monitorStatus,
          lastCheckTimestamp,
          currentUserQuery: currentUserQuery || config.DEFAULT_USER_QUERY,
          jobs,
        },
        { skipPersistence: true }
      );

      console.log('AppState: State loaded from storage', this.state);
    } catch (error) {
      console.error('AppState: Error loading from storage:', error);
    }
  }

  // === Private Methods ===

  private _processStateUpdates(updates: Partial<State>): Partial<State> {
    const processed: Partial<State> = {};
    for (const key in updates) {
      const value = updates[key as keyof State];
      if (value instanceof Set) {
        (processed as any)[key] = new Set(value);
      } else if (value instanceof Map) {
        (processed as any)[key] = new Map(value);
      } else {
        (processed as any)[key] = value;
      }
    }
    return processed;
  }

  private _notifyListeners(newState: State, prevState: State): void {
    this.listeners.forEach((listener) => {
      try {
        listener(newState, prevState);
      } catch (error) {
        console.error('AppState: Error in state listener:', error);
      }
    });

    this.selectorListeners.forEach((listeners, selector) => {
      const newValue = newState[selector];
      const prevValue = prevState[selector];

      if (this._hasSelectorChanged(selector, newValue, prevValue)) {
        listeners.forEach((listener) => {
          try {
            listener(newValue, prevValue);
          } catch (error) {
            console.error(`AppState: Error in selector listener for ${selector}:`, error);
          }
        });
      }
    });
  }

  private _hasSelectorChanged(selector: keyof State, newValue: any, prevValue: any): boolean {
    if (newValue !== prevValue) {
      if (newValue instanceof Set && prevValue instanceof Set) {
        return !this._areSetsEqual(newValue, prevValue);
      }
      if (newValue instanceof Map && prevValue instanceof Map) {
        return !this._areMapsEqual(newValue, prevValue);
      }
      return true;
    }
    return false;
  }

  private _areSetsEqual(set1: Set<any>, set2: Set<any>): boolean {
    if (set1.size !== set2.size) {
      return false;
    }
    for (const item of set1) {
      if (!set2.has(item)) {
        return false;
      }
    }
    return true;
  }

  private _areMapsEqual(map1: Map<any, any>, map2: Map<any, any>): boolean {
    if (map1.size !== map2.size) {
      return false;
    }
    for (const [key, value] of map1) {
      if (!map2.has(key) || map2.get(key) !== value) {
        return false;
      }
    }
    return true;
  }

  private async _saveToStorage(): Promise<void> {
    try {
      await Promise.all([
        StorageManager.setUiTheme(this.state.theme),
        StorageManager.setCollapsedJobIds(Array.from(this.state.collapsedJobIds)),
        StorageManager.setDeletedJobIds(Array.from(this.state.deletedJobIds)),
        StorageManager.setCurrentUserQuery(this.state.currentUserQuery),
      ]);
    } catch (error) {
      console.error('AppState: Error saving to storage:', error);
    }
  }

  private _debounce(func: (...args: any[]) => void, wait: number): () => void {
    let timeout: NodeJS.Timeout;
    return function executedFunction(...args: any[]) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
}

import { config } from '../background/config.js';
import { Job } from '../types.js';

/**
 * Manages all interactions with chrome.storage.local.
 * Centralizes storage logic and provides a clean API for other parts of the extension.
 */

// Use constants from the global config object
const STORAGE_KEYS = config.STORAGE_KEYS;
const MAX_SEEN_IDS = config.MAX_SEEN_IDS;
const MAX_DELETED_IDS = config.MAX_DELETED_IDS;
const MAX_RECENT_JOBS = config.API_FETCH_COUNT;

export const StorageManager = {
  /**
   * Retrieves a value from chrome.storage.local.
   * @param keyOrKeys The key(s) to retrieve.
   * @returns A promise that resolves with the storage data.
   */
  async getStorage(keyOrKeys: string | string[] | null): Promise<Record<string, unknown>> {
    try {
      const result = await browser.storage.local.get(keyOrKeys);
      return result;
    } catch (error: unknown) {
      console.error('StorageManager: Error getting storage:', error instanceof Error ? error.message : error);
      if (typeof keyOrKeys === 'string') {
        return { [keyOrKeys]: undefined };
      }
      if (Array.isArray(keyOrKeys)) {
        return keyOrKeys.reduce((acc: Record<string, unknown>, key) => {
          acc[key] = undefined;
          return acc;
        }, {});
      }
      if (keyOrKeys === null || (typeof keyOrKeys === 'object' && !Array.isArray(keyOrKeys))) {
        return {};
      }
      return {};
    }
  },

  /**
   * Sets a value(s) in browser.storage.local.
   * @param items An object containing key-value pairs to set.
   * @returns A promise that resolves when the data is set.
   */
  async setStorage(items: Record<string, unknown>): Promise<void> {
    try {
      await browser.storage.local.set(items);
    } catch (error: unknown) {
      console.error('StorageManager: Error setting storage:', error instanceof Error ? error.message : error);
    }
  },

  async getSeenJobIds(): Promise<Set<string>> {
    const result = await this.getStorage(STORAGE_KEYS.SEEN_JOB_IDS);
    const value = result[STORAGE_KEYS.SEEN_JOB_IDS];
    const ids = Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
    return new Set(ids);
  },

  async addSeenJobIds(newJobIdsArray: string[]): Promise<void> {
    const currentSeenIds = await this.getSeenJobIds();
    newJobIdsArray.forEach((id) => currentSeenIds.add(id));
    const prunedSeenJobIdsArray = Array.from(currentSeenIds).slice(-MAX_SEEN_IDS);
    await this.setStorage({ [STORAGE_KEYS.SEEN_JOB_IDS]: prunedSeenJobIdsArray });
  },

  async getDeletedJobIds(): Promise<Set<string>> {
    const result = await this.getStorage(STORAGE_KEYS.DELETED_JOB_IDS);
    const value = result[STORAGE_KEYS.DELETED_JOB_IDS];
    const ids = Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
    return new Set(ids);
  },

  async setDeletedJobIds(deletedIdsArray: string[]): Promise<void> {
    const prunedDeletedJobIdsArray = deletedIdsArray.slice(-MAX_DELETED_IDS);
    await this.setStorage({ [STORAGE_KEYS.DELETED_JOB_IDS]: prunedDeletedJobIdsArray });
  },

  async removeDeletedJobId(jobId: string): Promise<void> {
    const currentDeletedIds = await this.getDeletedJobIds();
    if (currentDeletedIds.has(jobId)) {
      currentDeletedIds.delete(jobId);
      await this.setStorage({ [STORAGE_KEYS.DELETED_JOB_IDS]: Array.from(currentDeletedIds) });
    }
  },

  async getMonitorStatus(): Promise<string> {
    const result = await this.getStorage(STORAGE_KEYS.MONITOR_STATUS);
    return (result[STORAGE_KEYS.MONITOR_STATUS] as string) || 'Unknown';
  },

  async setMonitorStatus(status: string): Promise<void> {
    await this.setStorage({ [STORAGE_KEYS.MONITOR_STATUS]: status });
  },

  async getLastCheckTimestamp(): Promise<number | null> {
    const result = await this.getStorage(STORAGE_KEYS.LAST_CHECK_TIMESTAMP);
    return (result[STORAGE_KEYS.LAST_CHECK_TIMESTAMP] as number) || null;
  },

  async setLastCheckTimestamp(timestamp: number): Promise<void> {
    await this.setStorage({ [STORAGE_KEYS.LAST_CHECK_TIMESTAMP]: timestamp });
  },

  async getNewJobsInLastRun(): Promise<number> {
    const result = await this.getStorage(STORAGE_KEYS.NEW_JOBS_IN_LAST_RUN);
    return (result[STORAGE_KEYS.NEW_JOBS_IN_LAST_RUN] as number) || 0;
  },

  async setNewJobsInLastRun(count: number): Promise<void> {
    await this.setStorage({ [STORAGE_KEYS.NEW_JOBS_IN_LAST_RUN]: count });
  },

  async getCurrentUserQuery(): Promise<string | null> {
    const result = await this.getStorage(STORAGE_KEYS.CURRENT_USER_QUERY);
    return (result[STORAGE_KEYS.CURRENT_USER_QUERY] as string) || null;
  },

  async setCurrentUserQuery(query: string): Promise<void> {
    await this.setStorage({ [STORAGE_KEYS.CURRENT_USER_QUERY]: query });
  },

  async getRecentFoundJobs(): Promise<Job[]> {
    const result = await this.getStorage(STORAGE_KEYS.RECENT_FOUND_JOBS);
    const value = result[STORAGE_KEYS.RECENT_FOUND_JOBS];
    // A more thorough type check for jobs could be added here if needed
    return Array.isArray(value) ? (value as Job[]) : [];
  },

  async setRecentFoundJobs(jobs: Job[]): Promise<void> {
    await this.setStorage({ [STORAGE_KEYS.RECENT_FOUND_JOBS]: jobs.slice(0, MAX_RECENT_JOBS) });
  },

  async getCollapsedJobIds(): Promise<Set<string>> {
    const result = await this.getStorage(STORAGE_KEYS.COLLAPSED_JOB_IDS);
    const value = result[STORAGE_KEYS.COLLAPSED_JOB_IDS];
    const ids = Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
    return new Set(ids);
  },

  async setCollapsedJobIds(collapsedIdsArray: string[]): Promise<void> {
    await this.setStorage({ [STORAGE_KEYS.COLLAPSED_JOB_IDS]: collapsedIdsArray });
  },

  async getApiEndpointToken(apiIdentifier: string): Promise<string | null> {
    const result = await this.getStorage(STORAGE_KEYS.API_ENDPOINT_TOKENS);
    const tokens = result[STORAGE_KEYS.API_ENDPOINT_TOKENS];
    if (tokens && typeof tokens === 'object' && !Array.isArray(tokens)) {
      return (tokens as Record<string, string>)[apiIdentifier] || null;
    }
    return null;
  },

  async setApiEndpointToken(apiIdentifier: string, token: string | null): Promise<void> {
    const result = await this.getStorage(STORAGE_KEYS.API_ENDPOINT_TOKENS);
    const tokens = (result[STORAGE_KEYS.API_ENDPOINT_TOKENS] as Record<string, string>) || {};
    if (token === null) {
      delete tokens[apiIdentifier];
    } else {
      tokens[apiIdentifier] = token;
    }
    await this.setStorage({ [STORAGE_KEYS.API_ENDPOINT_TOKENS]: tokens });
  },

  async getUiTheme(): Promise<string> {
    const result = await this.getStorage(STORAGE_KEYS.UI_THEME);
    return (result[STORAGE_KEYS.UI_THEME] as string) || 'light';
  },

  async setUiTheme(theme: string): Promise<void> {
    if (theme === 'light' || theme === 'dark') {
      await this.setStorage({ [STORAGE_KEYS.UI_THEME]: theme });
    } else {
      console.warn(`StorageManager: Invalid theme "${theme}" provided. Not setting.`);
    }
  },

  async initializeStorage(defaultUserQuery: string): Promise<void> {
    await this.setStorage({
      [STORAGE_KEYS.MONITOR_STATUS]: 'Initializing...',
      [STORAGE_KEYS.LAST_CHECK_TIMESTAMP]: null,
      [STORAGE_KEYS.NEW_JOBS_IN_LAST_RUN]: 0,
      [STORAGE_KEYS.SEEN_JOB_IDS]: [],
      [STORAGE_KEYS.DELETED_JOB_IDS]: [],
      [STORAGE_KEYS.RECENT_FOUND_JOBS]: [],
      [STORAGE_KEYS.COLLAPSED_JOB_IDS]: [],
      [STORAGE_KEYS.CURRENT_USER_QUERY]: defaultUserQuery,
      [STORAGE_KEYS.API_ENDPOINT_TOKENS]: {},
      [STORAGE_KEYS.UI_THEME]: 'light',
    });
  },
  STORAGE_KEYS,
};
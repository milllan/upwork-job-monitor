import 'jest-webextension-mock';

// Mock the entire config module BEFORE importing StorageManager
jest.mock('@background/config', () => ({
  config: {
    ...jest.requireActual('@background/config').config, // Keep other original config properties
    MAX_SEEN_IDS: 3, // Mock MAX_SEEN_IDS to 3 for this test suite
  },
}));

import { StorageManager } from '@storage/storage-manager';
import { config } from '@background/config'; // Import the actual config for its type and other properties
import { Job } from '../types';

// Helper function to create mock job objects
function createMockJob(id: string): Job {
  return {
    id: id,
    ciphertext: `cipher${id}`,
    title: `Job ${id}`,
    description: `Description for ${id}`,
    postedOn: new Date().toISOString(),
    applied: false,
    budget: { type: 'fixed', currencyCode: 'USD', minAmount: 100, maxAmount: 200 },
    client: { paymentVerificationStatus: 'VERIFIED', country: 'USA', totalSpent: 1000, rating: 4.5 },
    skills: [{ name: 'skill1' }, { name: 'skill2' }],
    _fullJobData: {},
  };
}

const STORAGE_KEYS = config.STORAGE_KEYS;

describe('StorageManager', () => {
  let localStorage: { [key: string]: unknown } = Object.create(null);

  beforeEach(() => {
    // Reset the in-memory store before each test
    localStorage = Object.create(null);

    // Mock for browser.storage.local.set
    (browser.storage.local.set as jest.Mock).mockImplementation((items: Record<string, unknown>) => {
      // Use Object.assign for a cleaner and more robust way to merge the new items
      Object.assign(localStorage, items);
      return Promise.resolve();
    });

    // Mock for browser.storage.local.get
    (browser.storage.local.get as jest.Mock).mockImplementation((keys: string | string[] | null) => {
      const result: Record<string, unknown> = Object.create(null);
      if (keys === null) {
        return Promise.resolve(localStorage);
      }
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const key of keyList) {
        if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
          result[key] = (localStorage as Record<string, unknown>)[key];
        }
      }
      return Promise.resolve(result);
    });
    
    // Mock for browser.storage.local.clear
    (browser.storage.local.clear as jest.Mock).mockImplementation(() => {
      localStorage = {};
      return Promise.resolve();
    });

    // Mock console methods
    global.console = { ...global.console, error: jest.fn(), warn: jest.fn() };
  });

  it('should set and get a single item from storage', async () => {
    const key = 'testKey';
    const value = 'testValue';
    await StorageManager.setStorage({ [key]: value });
    const result = await StorageManager.getStorage(key);
    expect(result[key]).toEqual(value);
  });

  it('should set and get multiple items from storage', async () => {
    const items = {
      key1: 'value1',
      key2: 123,
      key3: true,
    };
    await StorageManager.setStorage(items);
    const result = await StorageManager.getStorage(['key1', 'key2', 'key3']);
    expect(result.key1).toEqual('value1');
    expect(result.key2).toEqual(123);
    expect(result.key3).toEqual(true);
  });

  it('should return undefined for non-existent keys', async () => {
    const result = await StorageManager.getStorage('nonExistentKey');
    expect(result.nonExistentKey).toBeUndefined();
  });

  it('should handle errors during getStorage gracefully', async () => {
    // Mock an error during storage.local.get
    (browser.storage.local.get as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Test storage read error');
    });

    const result = await StorageManager.getStorage('someKey');
    expect(result.someKey).toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(
      'StorageManager: Error getting storage:',
      'Test storage read error'
    );
  });

  it('should handle errors during setStorage gracefully', async () => {
    // Mock an error during storage.local.set
    (browser.storage.local.set as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Test storage write error');
    });

    await StorageManager.setStorage({ errorKey: 'errorValue' });
    // Expect no error to be thrown, but console.error to be called
    expect(console.error).toHaveBeenCalledWith(
      'StorageManager: Error setting storage:',
      'Test storage write error'
    );
  });

  it('should initialize storage with default values', async () => {
    const defaultUserQuery = 'default query';
    await StorageManager.initializeStorage(defaultUserQuery);

    const result = await StorageManager.getStorage([
      STORAGE_KEYS.MONITOR_STATUS,
      STORAGE_KEYS.LAST_CHECK_TIMESTAMP,
      STORAGE_KEYS.NEW_JOBS_IN_LAST_RUN,
      STORAGE_KEYS.SEEN_JOB_IDS,
      STORAGE_KEYS.DELETED_JOB_IDS,
      STORAGE_KEYS.RECENT_FOUND_JOBS,
      STORAGE_KEYS.COLLAPSED_JOB_IDS,
      STORAGE_KEYS.CURRENT_USER_QUERY,
      STORAGE_KEYS.API_ENDPOINT_TOKENS,
      STORAGE_KEYS.UI_THEME,
    ]);

    expect(result[STORAGE_KEYS.MONITOR_STATUS]).toEqual('Initializing...');
    expect(result[STORAGE_KEYS.LAST_CHECK_TIMESTAMP]).toBeNull();
    expect(result[STORAGE_KEYS.NEW_JOBS_IN_LAST_RUN]).toEqual(0);
    expect(result[STORAGE_KEYS.SEEN_JOB_IDS]).toEqual([]);
    expect(result[STORAGE_KEYS.DELETED_JOB_IDS]).toEqual([]);
    expect(result[STORAGE_KEYS.RECENT_FOUND_JOBS]).toEqual([]);
    expect(result[STORAGE_KEYS.COLLAPSED_JOB_IDS]).toEqual([]);
    expect(result[STORAGE_KEYS.CURRENT_USER_QUERY]).toEqual(defaultUserQuery);
    expect(result[STORAGE_KEYS.API_ENDPOINT_TOKENS]).toEqual({});
    expect(result[STORAGE_KEYS.UI_THEME]).toEqual('light');
  });

  it('should add seen job IDs and prune old ones', async () => {
    // Mocking MAX_SEEN_IDS is now handled by jest.mock at the top of the file
    // No need for Object.defineProperty here

    const initialIds = ['id1', 'id2']; // Start with 2 IDs
    await StorageManager.setStorage({ [STORAGE_KEYS.SEEN_JOB_IDS]: initialIds });

    await StorageManager.addSeenJobIds(['id3', 'id4', 'id5']); // Add 3 more IDs
    const seenIds = await StorageManager.getSeenJobIds();

    // After adding 3 more, total is 5. With MAX_SEEN_IDS = 3, it should prune to the last 3.
    expect(seenIds.size).toBe(3);
    expect(seenIds.has('id1')).toBe(false); // id1 should be pruned
    expect(seenIds.has('id2')).toBe(false); // id2 should be pruned
    expect(seenIds.has('id3')).toBe(true);
    expect(seenIds.has('id4')).toBe(true);
    expect(seenIds.has('id5')).toBe(true);
    
    // No need to restore original MAX_SEEN_IDS as it's handled by jest.mock
  });

  it('should set and get monitor status', async () => {
    await StorageManager.setMonitorStatus('Monitoring');
    const status = await StorageManager.getMonitorStatus();
    expect(status).toEqual('Monitoring');
  });

  it('should set and get last check timestamp', async () => {
    const timestamp = Date.now();
    await StorageManager.setLastCheckTimestamp(timestamp);
    const retrievedTimestamp = await StorageManager.getLastCheckTimestamp();
    expect(retrievedTimestamp).toEqual(timestamp);
  });

  it('should set and get new jobs in last run count', async () => {
    await StorageManager.setNewJobsInLastRun(5);
    const count = await StorageManager.getNewJobsInLastRun();
    expect(count).toEqual(5);
  });

  it('should set and get current user query', async () => {
    const query = 'frontend developer';
    await StorageManager.setCurrentUserQuery(query);
    const retrievedQuery = await StorageManager.getCurrentUserQuery();
    expect(retrievedQuery).toEqual(query);
  });

  it('should set and get recent found jobs, respecting MAX_RECENT_JOBS', async () => {
    const jobs: Job[] = Array.from({ length: 13 }, (_, i) => createMockJob(`job${i + 1}`));

    // The number of jobs is sliced to `config.API_FETCH_COUNT` (12) by `setRecentFoundJobs`.
    await StorageManager.setRecentFoundJobs(jobs);
    const retrievedJobs = await StorageManager.getRecentFoundJobs();
    expect(retrievedJobs.length).toBe(config.API_FETCH_COUNT);
    expect(retrievedJobs[0].id).toEqual('job1');
    expect(retrievedJobs[retrievedJobs.length - 1].id).toEqual('job12');
  });

  it('should add and remove deleted job IDs', async () => {
    await StorageManager.setDeletedJobIds(['del1', 'del2']);
    let deletedIds = await StorageManager.getDeletedJobIds();
    expect(deletedIds.has('del1')).toBe(true);
    expect(deletedIds.has('del2')).toBe(true);

    await StorageManager.removeDeletedJobId('del1');
    deletedIds = await StorageManager.getDeletedJobIds();
    expect(deletedIds.has('del1')).toBe(false);
    expect(deletedIds.has('del2')).toBe(true);
  });

  it('should set and get collapsed job IDs', async () => {
    const collapsedIds = ['col1', 'col2'];
    await StorageManager.setCollapsedJobIds(collapsedIds);
    const retrievedCollapsedIds = await StorageManager.getCollapsedJobIds();
    expect(retrievedCollapsedIds.has('col1')).toBe(true);
    expect(retrievedCollapsedIds.has('col2')).toBe(true);
    expect(retrievedCollapsedIds.size).toEqual(2);
  });

  it('should set and get API endpoint token', async () => {
    const apiIdentifier = 'upwork';
    const token = 'some_token_string';
    await StorageManager.setApiEndpointToken(apiIdentifier, token);
    const retrievedToken = await StorageManager.getApiEndpointToken(apiIdentifier);
    expect(retrievedToken).toEqual(token);

    await StorageManager.setApiEndpointToken(apiIdentifier, null);
    const clearedToken = await StorageManager.getApiEndpointToken(apiIdentifier);
    expect(clearedToken).toBeNull();
  });

  it('should set and get UI theme', async () => {
    await StorageManager.setUiTheme('dark');
    const theme = await StorageManager.getUiTheme();
    expect(theme).toEqual('dark');

    await StorageManager.setUiTheme('light');
    const lightTheme = await StorageManager.getUiTheme();
    expect(lightTheme).toEqual('light');

    // Test invalid theme
    await StorageManager.setUiTheme('invalid' as unknown as 'light' | 'dark'); // Type assertion to bypass TS check
    const currentTheme = await StorageManager.getUiTheme();
    // Should remain 'light' as 'invalid' was not set
    expect(currentTheme).toEqual('light');
    expect(console.warn).toHaveBeenCalledWith(
      'StorageManager: Invalid theme "invalid" provided. Not setting.'
    );
  });

  it('should correctly handle a last check timestamp of 0', async () => {
    await StorageManager.setLastCheckTimestamp(0);
    const retrievedTimestamp = await StorageManager.getLastCheckTimestamp();
    expect(retrievedTimestamp).toEqual(0);
  });

  it('should correctly handle an empty string for the user query', async () => {
    await StorageManager.setCurrentUserQuery('');
    const retrievedQuery = await StorageManager.getCurrentUserQuery();
    expect(retrievedQuery).toEqual('');
  });

  it('should correctly handle a new jobs count of 0', async () => {
    await StorageManager.setNewJobsInLastRun(0);
    const count = await StorageManager.getNewJobsInLastRun();
    expect(count).toEqual(0);
  });
});
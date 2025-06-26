/* exported StorageManager */
/**
 * Manages all interactions with chrome.storage.local.
 * Centralizes storage logic and provides a clean API for other parts of the extension.
 */
console.log('Storage manager loaded.');

// Use constants from the global config object
// Assumes config.js is loaded before storage-manager.js
const STORAGE_KEYS = config.STORAGE_KEYS;
const MAX_SEEN_IDS = config.MAX_SEEN_IDS;
const MAX_DELETED_IDS = config.MAX_DELETED_IDS;
const MAX_RECENT_JOBS = config.API_FETCH_COUNT;

/**
 * Retrieves a value from chrome.storage.local.
 * @param {string|string[]} keyOrKeys The key(s) to retrieve.
 * @returns {Promise<Object>} A promise that resolves with the storage data.
 */
async function getStorage(keyOrKeys) {
  try {
    const result = await browser.storage.local.get(keyOrKeys);
    return result;
  } catch (error) {
    console.error('StorageManager: Error getting storage:', error.message);
    // Return a default structure similar to what a successful call might return with no data
    if (typeof keyOrKeys === 'string') {
      return { [keyOrKeys]: undefined };
    }
    if (Array.isArray(keyOrKeys)) {
      return keyOrKeys.reduce((acc, key) => {
        acc[key] = undefined;
        return acc;
      }, {});
    }
    if (keyOrKeys === null || typeof keyOrKeys === 'object') {
      return {};
    } // For get(null) or get({})
    return {}; // Fallback
  }
}

/**
 * Sets a value(s) in browser.storage.local.
 * @param {Object} items An object containing key-value pairs to set.
 * @returns {Promise<void>} A promise that resolves when the data is set.
 */
async function setStorage(items) {
  try {
    await browser.storage.local.set(items);
  } catch (error) {
    console.error('StorageManager: Error setting storage:', error.message);
    // The original implementation resolved even on error. We'll mimic this by catching.
  }
}

// Specific getter/setter functions

async function getSeenJobIds() {
  const result = await getStorage(STORAGE_KEYS.SEEN_JOB_IDS);
  return new Set(result[STORAGE_KEYS.SEEN_JOB_IDS] || []);
}

async function addSeenJobIds(newJobIdsArray) {
  const currentSeenIds = await getSeenJobIds();
  newJobIdsArray.forEach((id) => currentSeenIds.add(id));
  const prunedSeenJobIdsArray = Array.from(currentSeenIds).slice(-MAX_SEEN_IDS);
  await setStorage({ [STORAGE_KEYS.SEEN_JOB_IDS]: prunedSeenJobIdsArray });
}

async function getDeletedJobIds() {
  const result = await getStorage(STORAGE_KEYS.DELETED_JOB_IDS);
  return new Set(result[STORAGE_KEYS.DELETED_JOB_IDS] || []);
}

async function setDeletedJobIds(deletedIdsArray) {
  const prunedDeletedJobIdsArray = deletedIdsArray.slice(-MAX_DELETED_IDS);
  await setStorage({ [STORAGE_KEYS.DELETED_JOB_IDS]: prunedDeletedJobIdsArray });
}

async function removeDeletedJobId(jobId) {
  const currentDeletedIds = await getDeletedJobIds();
  if (currentDeletedIds.has(jobId)) {
    currentDeletedIds.delete(jobId);
    await setStorage({ [STORAGE_KEYS.DELETED_JOB_IDS]: Array.from(currentDeletedIds) });
  }
}

async function getMonitorStatus() {
  const result = await getStorage(STORAGE_KEYS.MONITOR_STATUS);
  return result[STORAGE_KEYS.MONITOR_STATUS] || 'Unknown';
}

async function setMonitorStatus(status) {
  await setStorage({ [STORAGE_KEYS.MONITOR_STATUS]: status });
}

async function getLastCheckTimestamp() {
  const result = await getStorage(STORAGE_KEYS.LAST_CHECK_TIMESTAMP);
  return result[STORAGE_KEYS.LAST_CHECK_TIMESTAMP] || null;
}

async function setLastCheckTimestamp(timestamp) {
  await setStorage({ [STORAGE_KEYS.LAST_CHECK_TIMESTAMP]: timestamp });
}

async function getNewJobsInLastRun() {
  const result = await getStorage(STORAGE_KEYS.NEW_JOBS_IN_LAST_RUN);
  return result[STORAGE_KEYS.NEW_JOBS_IN_LAST_RUN] || 0;
}

async function setNewJobsInLastRun(count) {
  await setStorage({ [STORAGE_KEYS.NEW_JOBS_IN_LAST_RUN]: count });
}

async function getCurrentUserQuery() {
  const result = await getStorage(STORAGE_KEYS.CURRENT_USER_QUERY);
  return result[STORAGE_KEYS.CURRENT_USER_QUERY] || null; // Return null, let caller apply default
}

async function setCurrentUserQuery(query) {
  await setStorage({ [STORAGE_KEYS.CURRENT_USER_QUERY]: query });
}

async function getRecentFoundJobs() {
  const result = await getStorage(STORAGE_KEYS.RECENT_FOUND_JOBS);
  return result[STORAGE_KEYS.RECENT_FOUND_JOBS] || [];
}

async function setRecentFoundJobs(jobs) {
  // Limit the number of recent jobs stored
  // The jobs array passed to this function is expected to be already filtered for deleted jobs.
  await setStorage({ [STORAGE_KEYS.RECENT_FOUND_JOBS]: jobs.slice(0, MAX_RECENT_JOBS) });
}

async function getCollapsedJobIds() {
  const result = await getStorage(STORAGE_KEYS.COLLAPSED_JOB_IDS);
  return new Set(result[STORAGE_KEYS.COLLAPSED_JOB_IDS] || []);
}

async function setCollapsedJobIds(collapsedIdsArray) {
  await setStorage({ [STORAGE_KEYS.COLLAPSED_JOB_IDS]: collapsedIdsArray });
}

async function getLastKnownGoodToken() {
  const result = await getStorage(STORAGE_KEYS.LAST_KNOWN_GOOD_TOKEN);
  return result[STORAGE_KEYS.LAST_KNOWN_GOOD_TOKEN] || null;
}

async function setLastKnownGoodToken(token) {
  // Store null to clear it if the token is explicitly set to null
  await setStorage({ [STORAGE_KEYS.LAST_KNOWN_GOOD_TOKEN]: token });
}

async function getUiTheme() {
  const result = await getStorage(STORAGE_KEYS.UI_THEME);
  // Default to 'light' if nothing is set
  return result[STORAGE_KEYS.UI_THEME] || 'light';
}

async function setUiTheme(theme) {
  if (theme === 'light' || theme === 'dark') {
    await setStorage({ [STORAGE_KEYS.UI_THEME]: theme });
  } else {
    console.warn(`StorageManager: Invalid theme "${theme}" provided. Not setting.`);
  }
}

/**
 * Initializes storage with default values on extension install or update.
 * @param {string} defaultUserQuery The default query to set initially.
 */
async function initializeStorage(defaultUserQuery) {
  await setStorage({
    [STORAGE_KEYS.MONITOR_STATUS]: 'Initializing...',
    [STORAGE_KEYS.LAST_CHECK_TIMESTAMP]: null,
    [STORAGE_KEYS.NEW_JOBS_IN_LAST_RUN]: 0,
    [STORAGE_KEYS.SEEN_JOB_IDS]: [],
    [STORAGE_KEYS.DELETED_JOB_IDS]: [],
    [STORAGE_KEYS.RECENT_FOUND_JOBS]: [],
    [STORAGE_KEYS.COLLAPSED_JOB_IDS]: [],
    [STORAGE_KEYS.CURRENT_USER_QUERY]: defaultUserQuery, // Set initial default query
    [STORAGE_KEYS.LAST_KNOWN_GOOD_TOKEN]: null,
    [STORAGE_KEYS.UI_THEME]: 'light', // Default theme
  });
}

// Make StorageManager globally available in the background page and popup (if loaded)
const StorageManager = {
  getSeenJobIds,
  addSeenJobIds,
  getDeletedJobIds,
  setDeletedJobIds,
  removeDeletedJobId,
  getMonitorStatus,
  setMonitorStatus,
  getLastCheckTimestamp,
  setLastCheckTimestamp,
  getNewJobsInLastRun,
  setNewJobsInLastRun,
  getCurrentUserQuery,
  setCurrentUserQuery,
  getRecentFoundJobs,
  setRecentFoundJobs,
  getCollapsedJobIds,
  setCollapsedJobIds,
  getLastKnownGoodToken,
  setLastKnownGoodToken,
  getUiTheme,
  setUiTheme,
  initializeStorage,
  STORAGE_KEYS, // Expose keys for direct access if needed (e.g., in popup load)
};

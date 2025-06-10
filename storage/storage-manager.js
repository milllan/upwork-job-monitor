/**
 * Manages all interactions with chrome.storage.local.
 * Centralizes storage logic and provides a clean API for other parts of the extension.
 */
console.log("Storage manager loaded.");

// Define storage keys internally for self-containment
const STORAGE_KEYS = {
  SEEN_JOB_IDS: 'seenJobIds',
  DELETED_JOB_IDS: 'deletedJobIds',
  MONITOR_STATUS: 'monitorStatus',
  LAST_CHECK_TIMESTAMP: 'lastCheckTimestamp',
  NEW_JOBS_IN_LAST_RUN: 'newJobsInLastRun',
  CURRENT_USER_QUERY: 'currentUserQuery',
  RECENT_FOUND_JOBS: 'recentFoundJobs',
  COLLAPSED_JOB_IDS: 'collapsedJobIds', // Used in popup
};

// Define limits internally for self-containment of storage logic
const MAX_SEEN_IDS = 500;
const MAX_DELETED_IDS = 200;
const MAX_RECENT_JOBS = 10; // Limit for recent jobs display

/**
 * Retrieves a value from chrome.storage.local.
 * @param {string|string[]} keyOrKeys The key(s) to retrieve.
 * @returns {Promise<Object>} A promise that resolves with the storage data.
 */
async function getStorage(keyOrKeys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keyOrKeys, (result) => {
      if (chrome.runtime.lastError) {
        console.error("StorageManager: Error getting storage:", chrome.runtime.lastError.message);
        // Depending on the key, you might return a default value or re-throw/reject
        // For simplicity now, just log and return the partial result
      }
      resolve(result);
    });
  });
}

/**
 * Sets a value(s) in chrome.storage.local.
 * @param {Object} items An object containing key-value pairs to set.
 * @returns {Promise<void>} A promise that resolves when the data is set.
 */
async function setStorage(items) {
  return new Promise((resolve) => {
    chrome.storage.local.set(items, () => {
      if (chrome.runtime.lastError) {
        console.error("StorageManager: Error setting storage:", chrome.runtime.lastError.message);
      }
      resolve();
    });
  });
}

// Specific getter/setter functions

async function getSeenJobIds() {
  const result = await getStorage(STORAGE_KEYS.SEEN_JOB_IDS);
  return new Set(result[STORAGE_KEYS.SEEN_JOB_IDS] || []);
}

async function addSeenJobIds(newJobIdsArray) {
  const currentSeenIds = await getSeenJobIds();
  newJobIdsArray.forEach(id => currentSeenIds.add(id));
  const prunedSeenJobIdsArray = Array.from(currentSeenIds).slice(-MAX_SEEN_IDS);
  await setStorage({ [STORAGE_KEYS.SEEN_JOB_IDS]: prunedSeenJobIdsArray });
}

async function getDeletedJobIds() {
  const result = await getStorage(STORAGE_KEYS.DELETED_JOB_IDS);
  return new Set(result[STORAGE_KEYS.DELETED_JOB_IDS] || []);
}

async function addDeletedJobIds(newJobIdsArray) {
   const currentDeletedIds = await getDeletedJobIds();
   newJobIdsArray.forEach(id => currentDeletedIds.add(id));
   const prunedDeletedJobIdsArray = Array.from(currentDeletedIds).slice(-MAX_DELETED_IDS);
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
  // Filter out deleted jobs before storing recent jobs
  const deletedIds = await getDeletedJobIds();
  const jobsToStore = jobs.filter(job => job && job.id && !deletedIds.has(job.id));
  // Limit the number of recent jobs stored
  await setStorage({ [STORAGE_KEYS.RECENT_FOUND_JOBS]: jobsToStore.slice(0, MAX_RECENT_JOBS) });
}

async function getCollapsedJobIds() {
    const result = await getStorage(STORAGE_KEYS.COLLAPSED_JOB_IDS);
    return new Set(result[STORAGE_KEYS.COLLAPSED_JOB_IDS] || []);
}

async function setCollapsedJobIds(collapsedIdsArray) {
    await setStorage({ [STORAGE_KEYS.COLLAPSED_JOB_IDS]: collapsedIdsArray });
}

/**
 * Initializes storage with default values on extension install or update.
 * @param {string} defaultUserQuery The default query to set initially.
 */
async function initializeStorage(defaultUserQuery) {
     await setStorage({
        [STORAGE_KEYS.MONITOR_STATUS]: "Initializing...",
        [STORAGE_KEYS.LAST_CHECK_TIMESTAMP]: null,
        [STORAGE_KEYS.NEW_JOBS_IN_LAST_RUN]: 0,
        [STORAGE_KEYS.SEEN_JOB_IDS]: [],
        [STORAGE_KEYS.DELETED_JOB_IDS]: [],
        [STORAGE_KEYS.RECENT_FOUND_JOBS]: [],
        [STORAGE_KEYS.COLLAPSED_JOB_IDS]: [],
        [STORAGE_KEYS.CURRENT_USER_QUERY]: defaultUserQuery // Set initial default query
     });
}

// Make StorageManager globally available in the background page and popup (if loaded)
const StorageManager = {
  getSeenJobIds,
  addSeenJobIds,
  getDeletedJobIds,
  addDeletedJobIds,
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
  initializeStorage,
  STORAGE_KEYS // Expose keys for direct access if needed (e.g., in popup load)
};
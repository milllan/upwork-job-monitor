// background/service-worker.js (Manifest V2 - Dynamic Token Attempt)
console.log('Background Script MV2 loaded - Dynamic Token Attempt.');
// --- WebRequest Listener to Modify Headers ---

// Helper function to upsert (update or insert) a header in a requestHeaders array
function upsertHeader(headers, name, value) {
  const lowerName = name.toLowerCase();
  const index = headers.findIndex((h) => h.name.toLowerCase() === lowerName);
  if (index > -1) {
    headers[index].value = value;
  } else {
    headers.push({ name: name, value: value });
  }
}

browser.webRequest.onBeforeSendHeaders.addListener(
  function (details) {
    // Check if the request matches the target GraphQL endpoint and method
    const isTargetRequest =
      details.url.startsWith(config.UPWORK_GRAPHQL_ENDPOINT_BASE) &&
      details.method === 'POST' &&
      details.type === 'xmlhttprequest';

    if (!isTargetRequest) {
      return { cancel: false }; // Don't modify other requests
    }

    // Filter out unwanted headers
    const newHeaders = details.requestHeaders.filter((header) => {
      // Use config for headers to remove
      return !config.WEBREQUEST_HEADERS.HEADERS_TO_REMOVE.includes(header.name.toLowerCase());
    });

    // Add/Update required headers using the helper function and config values
    upsertHeader(newHeaders, 'Origin', config.UPWORK_DOMAIN);
    upsertHeader(newHeaders, 'Referer', `${config.UPWORK_DOMAIN}/nx/search/jobs/`);
    upsertHeader(newHeaders, 'X-Upwork-API-TenantId', config.X_UPWORK_API_TENANT_ID);
    upsertHeader(
      newHeaders,
      'X-Upwork-Accept-Language',
      config.WEBREQUEST_HEADERS.X_UPWORK_ACCEPT_LANGUAGE
    );
    upsertHeader(newHeaders, 'DNT', config.WEBREQUEST_HEADERS.DNT);
    upsertHeader(newHeaders, 'User-Agent', config.WEBREQUEST_HEADERS.USER_AGENT);
    upsertHeader(newHeaders, 'Accept-Language', config.WEBREQUEST_HEADERS.ACCEPT_LANGUAGE);

    return { requestHeaders: newHeaders };
  },
  { urls: [config.TARGET_GRAPHQL_URL_PATTERN] },
  ['blocking', 'requestHeaders']
);

let isJobCheckRunning = false; // Flag to prevent concurrent runs

/**
 * Applies client-side filtering rules (title exclusion, skill/country low-priority)
 * to a list of jobs.
 * @param {Array<Object>} jobs - The array of job objects to process.
 * @returns {Object} An object containing the processed jobs and counts of filtered jobs.
 */
function _applyClientSideFilters(jobs) {
  let titleExcludedCount = 0;
  let skillLowPriorityCount = 0;
  let clientCountryLowPriorityCount = 0;

  const processedJobs = jobs.map((job) => {
    const newJobData = {
      ...job,
      isExcludedByTitleFilter: false,
      isLowPriorityBySkill: false,
      isLowPriorityByClientCountry: false,
    };

    // 1. Apply TITLE based exclusion
    const titleLower = (job.title || '').toLowerCase(); // Ensure title is lowercase for comparison
    if (
      config.TITLE_EXCLUSION_STRINGS.length > 0 &&
      config.TITLE_EXCLUSION_STRINGS.some((excludeString) => titleLower.includes(excludeString))
    ) {
      newJobData.isExcludedByTitleFilter = true;
      titleExcludedCount++;
    }

    // 2. Apply SKILL based low-priority marking
    if (
      Array.isArray(job.ontologySkills) &&
      job.ontologySkills.length > 0 &&
      config.SKILL_LOW_PRIORITY_TERMS.length > 0
    ) {
      for (const skill of job.ontologySkills) {
        if (
          skill &&
          skill.prefLabel &&
          config.SKILL_LOW_PRIORITY_TERMS.includes(skill.prefLabel.toLowerCase())
        ) {
          newJobData.isLowPriorityBySkill = true;
          skillLowPriorityCount++;
          break; // Found a matching low-priority skill, no need to check further for this job
        }
      }
    }

    // 3. Apply CLIENT COUNTRY based low-priority marking
    if (job.client && job.client.country && config.CLIENT_COUNTRY_LOW_PRIORITY.length > 0) {
      if (config.CLIENT_COUNTRY_LOW_PRIORITY.includes(job.client.country.toLowerCase())) {
        newJobData.isLowPriorityByClientCountry = true;
        clientCountryLowPriorityCount++;
      }
    }
    return newJobData;
  });

  return {
    processedJobs,
    titleExcludedCount,
    skillLowPriorityCount,
    clientCountryLowPriorityCount,
  };
}

/**
 * Processes fetched jobs for deduplication, updates seen/collapsed IDs, and sends notifications.
 * @param {Array<Object>} fetchedJobs - The jobs fetched from the API, already processed by client-side filters.
 * @param {Set<string>} historicalSeenJobIds - Set of job IDs seen historically.
 * @param {Set<string>} deletedJobIds - Set of job IDs deleted by the user.
 * @param {Set<string>} currentCollapsedJobIds - Current set of collapsed job IDs.
 * @returns {Promise<Object>} An object containing counts of new/notifiable jobs and the updated collapsed job IDs.
 */
async function _processAndNotifyNewJobs(
  fetchedJobs,
  historicalSeenJobIds,
  deletedJobIds,
  currentCollapsedJobIds
) {
  // Filter out jobs that are already seen OR have been explicitly deleted by the user from the *fetched* list
  const allNewOrUpdatedJobs = fetchedJobs.filter(
    (job) => job && job.id && !historicalSeenJobIds.has(job.id) && !deletedJobIds.has(job.id)
  );
  // From these, determine which are truly new AND notifiable (not excluded by title filter)
  const notifiableNewJobs = allNewOrUpdatedJobs.filter(
    (job) =>
      !job.isExcludedByTitleFilter &&
      !job.isLowPriorityBySkill &&
      !job.isLowPriorityByClientCountry &&
      job.applied !== true
  );
  const newJobIdsToMarkSeen = [];
  fetchedJobs.forEach((job) => {
    if (job && job.id && !historicalSeenJobIds.has(job.id)) {
      newJobIdsToMarkSeen.push(job.id);
      // If it's a new, low-priority job OR a new "Filtered" (excluded by title) job,
      // add to collapsedJobIds so it starts collapsed in the popup.
      if (
        (job.isLowPriorityBySkill ||
          job.isLowPriorityByClientCountry ||
          job.isExcludedByTitleFilter) &&
        !currentCollapsedJobIds.has(job.id)
      ) {
        currentCollapsedJobIds.add(job.id);
      }
    }
  });
  await StorageManager.addSeenJobIds(newJobIdsToMarkSeen);
  if (notifiableNewJobs.length > 0) {
    notifiableNewJobs.forEach((job) => sendNotification(job));
  }
  return {
    allNewOrUpdatedJobsCount: allNewOrUpdatedJobs.length,
    notifiableNewJobsCount: notifiableNewJobs.length,
    updatedCollapsedJobIds: currentCollapsedJobIds,
  };
}

// Helper to send message to popup if open
async function _sendPopupUpdateMessage() {
  try {
    const popupViews = browser.extension.getViews({ type: 'popup' });
    if (popupViews && popupViews.length > 0) {
      await browser.runtime.sendMessage({ action: 'updatePopupDisplay' });
    } else {
      console.log('MV2: Popup not open, skipping updatePopupDisplay message.');
    }
  } catch (e) {
    console.warn('MV2: Error during conditional send of updatePopupDisplay message:', e);
  }
}

// --- Storage Update Helper ---
/**
 * Updates various storage items after a job check.
 * @param {number} notifiableNewJobsCount - Number of new, notifiable jobs found.
 * @param {Array<Object>} fetchedJobs - All jobs fetched from the API (after client-side filtering).
 * @param {Set<string>} updatedCollapsedJobIds - The set of collapsed job IDs, including newly collapsed ones.
 * @param {Set<string>} deletedJobIds - The set of job IDs deleted by the user.
 */
async function _updateStorageAfterCheck(
  notifiableNewJobsCount,
  fetchedJobs,
  updatedCollapsedJobIds,
  deletedJobIds
) {
  await StorageManager.setMonitorStatus(`Checked. New (notifiable): ${notifiableNewJobsCount}`);
  await StorageManager.setNewJobsInLastRun(notifiableNewJobsCount);
  await StorageManager.setLastCheckTimestamp(Date.now());
  // Filter out deleted jobs before storing recent jobs
  const jobsToStore = fetchedJobs
    ? fetchedJobs.filter((job) => job && job.id && !deletedJobIds.has(job.id))
    : [];
  await StorageManager.setRecentFoundJobs(jobsToStore);
  await StorageManager.setCollapsedJobIds(Array.from(updatedCollapsedJobIds)); // Save updated collapsed IDs
}

// --- MODIFIED Helper Function for Smart Error Handling ---
/**
 * Handles API failures, providing specific user feedback and actions.
 * Opens a relevant Upwork tab ONLY on authentication-related errors (HTTP 403).
 * @param {object} errorResult - The error object from the API call.
 * @param {string} context - The context of the API call ('jobSearch', 'jobDetails', 'talentProfile').
 * @param {object} [options={}] - Context-specific options.
 * @param {string} [options.ciphertext] - The ciphertext ID for details/profile calls.
 */
async function _handleApiTokenFailure(errorResult, context, options = {}) {
  const isAuthFailure = errorResult.type === 'http' && errorResult.details?.status === 403;

  if (isAuthFailure) {
    await StorageManager.setMonitorStatus('Authentication failed. Please log in to Upwork.');
    let recoveryUrl = config.UPWORK_DOMAIN;

    // Build context-specific recovery URL
    switch (context) {
      case 'jobSearch':
        recoveryUrl = `${config.UPWORK_DOMAIN}/nx/find-work/`;
        break;
      case 'jobDetails':
        if (options.ciphertext) {
          recoveryUrl = `${config.UPWORK_DOMAIN}/jobs/${options.ciphertext}`;
        }
        break;
      case 'talentProfile':
        if (options.ciphertext) {
          recoveryUrl = `${config.UPWORK_DOMAIN}/freelancers/${options.ciphertext}`;
        }
        break;
    }

    try {
      await browser.tabs.create({ url: recoveryUrl });
    } catch (e) {
      console.warn(`MV2: Error trying to open recovery tab for ${context}:`, e);
    }
  } else {
    // For other errors (network, parsing, server errors), just update the status.
    const errorMessage = `API Error: ${errorResult.type || 'Unknown'}. Check console.`;
    await StorageManager.setMonitorStatus(errorMessage);
  }

  // Notify the popup that the state has changed
  await _sendPopupUpdateMessage();
}

/**
 * Contains the core logic for a single job check run.
 * This function is called by the `runJobCheck` orchestrator.
 * @param {string} triggeredByUserQuery - A specific query from a user action, or null/undefined.
 */
async function _performJobCheckLogic(triggeredByUserQuery) {
  console.log('MV2: Attempting runJobCheck (Direct Background with token loop)...');
  await StorageManager.setMonitorStatus('Checking...');

  const userQueryToUse =
    triggeredByUserQuery ||
    (await StorageManager.getCurrentUserQuery()) ||
    config.DEFAULT_USER_QUERY;

  const apiResult = await UpworkAPI.fetchJobs(userQueryToUse);

  if (apiResult.error) {
    console.error('MV2: Failed to fetch jobs after trying all tokens.', apiResult);
    // The options object is not strictly needed here but keeps the pattern consistent.
    await _handleApiTokenFailure(apiResult, 'jobSearch', {});
    return; // Exit the logic flow on failure
  }

  let fetchedJobs = apiResult.jobs;

  // Apply client-side title exclusion and skill-based low-priority marking
  if (fetchedJobs && fetchedJobs.length > 0) {
    const originalJobCount = fetchedJobs.length;
    const processedJobsResult = _applyClientSideFilters(fetchedJobs);
    fetchedJobs = processedJobsResult.processedJobs;
    console.log(
      `MV2: Processed ${originalJobCount} jobs. Marked ${processedJobsResult.titleExcludedCount} as excluded by title. Marked ${processedJobsResult.skillLowPriorityCount} as low-priority by skill. Marked ${processedJobsResult.clientCountryLowPriorityCount} as low-priority by client country.`
    );
  }

  // Deduplication, Notification, and Collapsed ID Management
  const historicalSeenJobIds = await StorageManager.getSeenJobIds();
  const deletedJobIds = await StorageManager.getDeletedJobIds();
  const currentCollapsedJobIds = await StorageManager.getCollapsedJobIds();

  const processResult = await _processAndNotifyNewJobs(
    fetchedJobs,
    historicalSeenJobIds,
    deletedJobIds,
    currentCollapsedJobIds
  );

  console.log(
    `MV2 DirectBG: Token Loop. Found ${processResult.allNewOrUpdatedJobsCount} new/updated jobs, ${processResult.notifiableNewJobsCount} are notifiable.`
  );

  // Update storage
  await _updateStorageAfterCheck(
    processResult.notifiableNewJobsCount,
    fetchedJobs,
    processResult.updatedCollapsedJobIds,
    deletedJobIds
  );

  // Send message to popup
  await _sendPopupUpdateMessage();
}

/**
 * Orchestrates the job checking process, ensuring it doesn't run concurrently.
 * This function acts as a gatekeeper and error handler for the core logic.
 * @param {string} triggeredByUserQuery - A query from a user action, if any.
 */
async function runJobCheck(triggeredByUserQuery) {
  if (isJobCheckRunning) {
    console.log('MV2: runJobCheck - Job check already in progress. Skipping this run.');
    await StorageManager.setMonitorStatus('Busy, check in progress...');
    return;
  }
  isJobCheckRunning = true;

  try {
    // Delegate the core logic to the new helper function
    await _performJobCheckLogic(triggeredByUserQuery);
  } catch (error) {
    // Catch any unexpected errors from the logic function
    console.error('MV2: An unexpected error occurred during the job check process:', error);
    await StorageManager.setMonitorStatus('Error. Check console.');
    await _sendPopupUpdateMessage(); // Notify popup of the error status
  } finally {
    isJobCheckRunning = false;
    console.log('MV2: runJobCheck finished. isJobCheckRunning set to false.');
  }
}

// --- Initial Setup and Alarm Creation ---
// Initialize storage and set up alarms on install/update

browser.runtime.onInstalled.addListener(async (details) => {
  // Made async
  console.log('MV2: Extension installed or updated:', details.reason);
  await StorageManager.initializeStorage(config.DEFAULT_USER_QUERY);
  await setupAlarms(); // Always set up alarms on install/update
});

async function setupAlarms() {
  // Made async
  try {
    const alarm = await browser.alarms.get(config.FETCH_ALARM_NAME); // Use config.FETCH_ALARM_NAME
    if (!alarm) {
      await browser.alarms.create(config.FETCH_ALARM_NAME, {
        delayInMinutes: 0.2,
        periodInMinutes: config.FETCH_INTERVAL_MINUTES,
      }); // Use config for interval too
    }
  } catch (e) {
    console.error('MV2: Error setting up alarm:', e);
  }
}
browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === config.FETCH_ALARM_NAME) {
    // Use config.FETCH_ALARM_NAME
    await runJobCheck();
  }
});
async function sendNotification(job) {
  // Made async
  const jobUrl = `https://www.upwork.com/jobs/${job.ciphertext || job.id}`;
  // Use formatBudget from utils.js for budget formatting
  const budgetString = formatBudget(job.budget);
  const notificationOptions = {
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: 'New Upwork Job!',
    message:
      budgetString && budgetString !== 'N/A' ? `${job.title}\nBudget: ${budgetString}` : job.title,
    priority: 2,
  };
  try {
    await browser.notifications.create(jobUrl, notificationOptions);
    // Play notification sound
    const audio = new Audio(browser.runtime.getURL('audio/notification.mp3'));
    audio.play().catch((e) => console.warn('MV2: Error playing notification sound:', e));
  } catch (e) {
    console.error('MV2: Error creating notification:', e);
  }
}

browser.notifications.onClicked.addListener(async (notificationId) => {
  // Made async
  try {
    await browser.tabs.create({ url: notificationId });
    await browser.notifications.clear(notificationId);
  } catch (e) {
    console.error('MV2: Error handling notification click:', e);
  }
});

// --- MODIFIED Message Handlers ---

async function _handleManualCheck(request) {
  const queryFromPopup = request.userQuery || config.DEFAULT_USER_QUERY;
  await StorageManager.setCurrentUserQuery(queryFromPopup);
  await runJobCheck(queryFromPopup); // This now has the smart error handler
  return { status: 'Manual check initiated and processing.' };
}

// MODIFIED: This function now just calls the processing function
async function _handleGetJobDetails(request) {
  if (!request.jobCiphertext) {
    throw new Error('jobCiphertext is required for getJobDetails action.');
  }
  return await _fetchAndProcessJobDetails(request.jobCiphertext);
}

// NEW: Handler for talent profile requests
async function _handleGetTalentProfile(request) {
  if (!request.profileCiphertext) {
    throw new Error('profileCiphertext is required for getTalentProfile action.');
  }
  return await _fetchAndProcessTalentProfile(request.profileCiphertext);
}

const messageHandlers = {
  manualCheck: _handleManualCheck,
  getJobDetails: _handleGetJobDetails,
  getTalentProfile: _handleGetTalentProfile, // ADDED
};

browser.runtime.onMessage.addListener(async (request, _sender) => {
  const handler = messageHandlers[request.action];
  if (handler) {
    try {
      // Await the handler and return its result directly.
      // This correctly propagates the successful data or the error object.
      return await handler(request);
    } catch (error) {
      console.error(
        `Background: Error handling action "${request.action}":`,
        error.message,
        error.stack
      );
      return { error: true, message: `Error during ${request.action}: ${error.message}` };
    }
  } else if (request.action) {
    console.warn(`MV2: No message handler found for action: ${request.action}`);
  }
});

// MODIFIED: This now contains the smart error handling logic
async function _fetchAndProcessJobDetails(jobCiphertext) {
  const apiResult = await UpworkAPI.fetchJobDetails(jobCiphertext);

  if (apiResult.error) {
    console.error('MV2: Failed to fetch job details.', apiResult);
    // On auth failure for a user-initiated action, we can open a tab and still return an error.
    if (apiResult.type === 'http' && apiResult.details.status === 403) {
      await _handleApiTokenFailure(apiResult, 'jobDetails', { ciphertext: jobCiphertext });
    }
    // Throw an error to be caught by the popup's logic and displayed in the UI.
    throw new Error(apiResult.message || `API Error: ${apiResult.type}`);
  }

  return { jobDetails: apiResult.jobDetails };
}

// NEW: Processing function for talent profiles
async function _fetchAndProcessTalentProfile(profileCiphertext) {
  const apiResult = await UpworkAPI.fetchTalentProfile(profileCiphertext);

  if (apiResult.error) {
    console.error('MV2: Failed to fetch talent profile.', apiResult);
    if (apiResult.type === 'http' && apiResult.details.status === 403) {
      await _handleApiTokenFailure(apiResult, 'talentProfile', { ciphertext: profileCiphertext });
    }
    throw new Error(apiResult.message || `API Error: ${apiResult.type}`);
  }

  return { profileDetails: apiResult.profileDetails };
}

setupAlarms();
runJobCheck(); // Perform an initial job check as soon as the extension loads.

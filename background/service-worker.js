// background.js (Manifest V2 - Dynamic Token Attempt)
console.log("Background Script MV2 loaded - Dynamic Token Attempt.");
// --- WebRequest Listener to Modify Headers ---

// Helper function to upsert (update or insert) a header in a requestHeaders array
function upsertHeader(headers, name, value) {
  const lowerName = name.toLowerCase();
  const index = headers.findIndex(h => h.name.toLowerCase() === lowerName);
  if (index > -1) {
    headers[index].value = value;
  } else {
    headers.push({ name: name, value: value });
  }
}

// Headers to remove from the request (case-insensitive)
const HEADERS_TO_REMOVE = [
  'sec-fetch-site',
  'sec-fetch-mode',
  'sec-fetch-dest',
  'origin',
  'referer',
  'x-upwork-api-tenantid',
  'x-upwork-accept-language',
  'dnt'
];

browser.webRequest.onBeforeSendHeaders.addListener(
  function(details) {
    // Check if the request matches the target GraphQL endpoint and method
    const isTargetRequest = details.url.startsWith(config.UPWORK_GRAPHQL_ENDPOINT_BASE) &&
                            details.method === "POST" &&
                            details.type === "xmlhttprequest";

    if (!isTargetRequest) {
      return { cancel: false }; // Don't modify other requests
    }

    // Filter out unwanted headers
    const newHeaders = details.requestHeaders.filter(header => {
      return !HEADERS_TO_REMOVE.includes(header.name.toLowerCase());
    });

    // Add/Update required headers using the helper function and config values
    upsertHeader(newHeaders, "Origin", config.UPWORK_DOMAIN);
    upsertHeader(newHeaders, "Referer", `${config.UPWORK_DOMAIN}/nx/search/jobs/`);
    upsertHeader(newHeaders, "X-Upwork-API-TenantId", config.X_UPWORK_API_TENANT_ID);
    upsertHeader(newHeaders, "X-Upwork-Accept-Language", config.WEBREQUEST_HEADERS.X_UPWORK_ACCEPT_LANGUAGE);
    upsertHeader(newHeaders, "DNT", config.WEBREQUEST_HEADERS.DNT);
    upsertHeader(newHeaders, "User-Agent", config.WEBREQUEST_HEADERS.USER_AGENT);
    upsertHeader(newHeaders, "Accept-Language", config.WEBREQUEST_HEADERS.ACCEPT_LANGUAGE);

    return { requestHeaders: newHeaders };
  },
  { urls: [config.TARGET_GRAPHQL_URL_PATTERN] },
  ["blocking", "requestHeaders"]
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

  const processedJobs = jobs.map(job => {
    const newJobData = { ...job, isExcludedByTitleFilter: false, isLowPriorityBySkill: false, isLowPriorityByClientCountry: false };

    // 1. Apply TITLE based exclusion
    const titleLower = (job.title || "").toLowerCase(); // Ensure title is lowercase for comparison
    if (config.TITLE_EXCLUSION_STRINGS.length > 0 && config.TITLE_EXCLUSION_STRINGS.some(excludeString => titleLower.includes(excludeString))) {
      newJobData.isExcludedByTitleFilter = true;
      titleExcludedCount++;
    }

    // 2. Apply SKILL based low-priority marking
    if (Array.isArray(job.ontologySkills) && job.ontologySkills.length > 0 && config.SKILL_LOW_PRIORITY_TERMS.length > 0) {
      for (const skill of job.ontologySkills) {
        if (skill && skill.prefLabel && config.SKILL_LOW_PRIORITY_TERMS.includes(skill.prefLabel.toLowerCase())) {
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
    clientCountryLowPriorityCount
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
async function _processAndNotifyNewJobs(fetchedJobs, historicalSeenJobIds, deletedJobIds, currentCollapsedJobIds) {
  // Filter out jobs that are already seen OR have been explicitly deleted by the user from the *fetched* list
  const allNewOrUpdatedJobs = fetchedJobs.filter(job =>
    job && job.id && !historicalSeenJobIds.has(job.id) && !deletedJobIds.has(job.id)
  );
  // From these, determine which are truly new AND notifiable (not excluded by title filter)
  const notifiableNewJobs = allNewOrUpdatedJobs.filter(job =>
    !job.isExcludedByTitleFilter && !job.isLowPriorityBySkill && !job.isLowPriorityByClientCountry && job.applied !== true
  );

  const newJobIdsToMarkSeen = [];
  fetchedJobs.forEach(job => {
    if (job && job.id && !historicalSeenJobIds.has(job.id)) {
      newJobIdsToMarkSeen.push(job.id);
      // If it's a new, low-priority job OR a new "Filtered" (excluded by title) job,
      // add to collapsedJobIds so it starts collapsed in the popup.
      if ((job.isLowPriorityBySkill || job.isLowPriorityByClientCountry || job.isExcludedByTitleFilter) && !currentCollapsedJobIds.has(job.id)) {
        currentCollapsedJobIds.add(job.id);
      }
    }
  });
  await StorageManager.addSeenJobIds(newJobIdsToMarkSeen);

  if (notifiableNewJobs.length > 0) {
    notifiableNewJobs.forEach(job => sendNotification(job));
  }

  return {
    allNewOrUpdatedJobsCount: allNewOrUpdatedJobs.length,
    notifiableNewJobsCount: notifiableNewJobs.length,
    updatedCollapsedJobIds: currentCollapsedJobIds
  };
}

// Helper to send message to popup if open
async function _sendPopupUpdateMessage() {
  try {
    const popupViews = browser.extension.getViews({ type: "popup" });
    if (popupViews && popupViews.length > 0) {
      await browser.runtime.sendMessage({ action: "updatePopupDisplay" });
    } else {
      console.log("MV2: Popup not open, skipping updatePopupDisplay message.");
    }
  } catch (e) {
    console.warn("MV2: Error during conditional send of updatePopupDisplay message:", e);
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
async function _updateStorageAfterCheck(notifiableNewJobsCount, fetchedJobs, updatedCollapsedJobIds, deletedJobIds) {
  await StorageManager.setMonitorStatus(`Checked. New (notifiable): ${notifiableNewJobsCount}`);
  await StorageManager.setNewJobsInLastRun(notifiableNewJobsCount);
  await StorageManager.setLastCheckTimestamp(Date.now());
  // Filter out deleted jobs before storing recent jobs
  const jobsToStore = fetchedJobs ? fetchedJobs.filter(job => job && job.id && !deletedJobIds.has(job.id)) : [];
  await StorageManager.setRecentFoundJobs(jobsToStore);
  await StorageManager.setCollapsedJobIds(Array.from(updatedCollapsedJobIds)); // Save updated collapsed IDs
}

// --- Main Job Checking Logic (runJobCheck) ---
async function runJobCheck(triggeredByUserQuery) {
  if (isJobCheckRunning) {
    console.log("MV2: runJobCheck - Job check already in progress. Skipping this run.");
    // Optionally, update status to indicate it's busy, though the existing "Checking..." from the ongoing run might suffice.
    // await StorageManager.setMonitorStatus("Busy, check in progress...");
    return;
  }
  isJobCheckRunning = true;

  try {
    console.log("MV2: Attempting runJobCheck (Direct Background with token loop)...");
    await StorageManager.setMonitorStatus("Checking...");
    
    // Use the passed query or get from storage
    const userQueryToUse = triggeredByUserQuery ||
      await StorageManager.getCurrentUserQuery() || // Use StorageManager
      config.DEFAULT_USER_QUERY; // Use config object
      
    console.log("MV2: Using query for check:", userQueryToUse);

    const apiResult = await UpworkAPI.fetchJobsWithTokenRotation(userQueryToUse);

    let fetchedJobs = null;
    // let successfulToken = null; // This variable is assigned but its value is never read.

    if (apiResult && !apiResult.error) {
      fetchedJobs = apiResult.jobs;
      // successfulToken = apiResult.token;
    } else {
      console.error("MV2: Failed to fetch jobs after trying all tokens.", apiResult?.message);
      await StorageManager.setMonitorStatus("Error: All tokens failed // Authentication failed. Please ensure you are logged into Upwork in another tab and then click 'Check Now.");
      // Open Upwork search page to help re-establish tokens
      try {
        const searchUrl = constructUpworkSearchURL(userQueryToUse, config.DEFAULT_CONTRACTOR_TIERS_GQL, config.DEFAULT_SORT_CRITERIA);
        await browser.tabs.create({ url: searchUrl });
        await _sendPopupUpdateMessage(); // Notify popup of error state
      } catch (e) { console.warn("MV2: Error trying to open tab or send updatePopupDisplay message:", e); }
      return; // Exit runJobCheck; 'finally' block will execute before returning
    }
    
    // Apply client-side title exclusion and skill-based low-priority marking
    if (fetchedJobs && fetchedJobs.length > 0) {
      const originalJobCount = fetchedJobs.length; // Store original count before processing
      const processedJobsResult = _applyClientSideFilters(fetchedJobs);
      fetchedJobs = processedJobsResult.processedJobs; // Update fetchedJobs with processed ones
      console.log(`MV2: Processed ${originalJobCount} jobs. Marked ${processedJobsResult.titleExcludedCount} as excluded by title. Marked ${processedJobsResult.skillLowPriorityCount} as low-priority by skill. Marked ${processedJobsResult.clientCountryLowPriorityCount} as low-priority by client country.`);
    }

    // Deduplication, Notification, and Collapsed ID Management
    const historicalSeenJobIds = await StorageManager.getSeenJobIds();
    const deletedJobIds = await StorageManager.getDeletedJobIds();
    const currentCollapsedJobIds = await StorageManager.getCollapsedJobIds(); // Get current collapsed IDs

    const processResult = await _processAndNotifyNewJobs(fetchedJobs, historicalSeenJobIds, deletedJobIds, currentCollapsedJobIds);

    console.log(`MV2 DirectBG: Token Loop. Found ${processResult.allNewOrUpdatedJobsCount} new/updated jobs, ${processResult.notifiableNewJobsCount} are notifiable.`);

    // Update storage
    await _updateStorageAfterCheck(
      processResult.notifiableNewJobsCount,
      fetchedJobs,
      processResult.updatedCollapsedJobIds,
      deletedJobIds
    );

    // Send message to popup
    await _sendPopupUpdateMessage();

  } finally {
    isJobCheckRunning = false;
    console.log("MV2: runJobCheck finished. isJobCheckRunning set to false.");
  }
}

// --- Test Function, onInstalled, Alarms, Notifications, onMessage (remain the same) ---
// async function testFetchJobs() {
//   console.log("MV2: Running testFetchJobs (Direct Background Attempt)...");
//   await runJobCheck();
// }

browser.runtime.onInstalled.addListener(async (details) => { // Made async
  console.log("MV2: Extension installed or updated:", details.reason);
  await StorageManager.initializeStorage(config.DEFAULT_USER_QUERY);
  await setupAlarms(); // Always set up alarms on install/update
});

async function setupAlarms() { // Made async
  try {
    const alarm = await browser.alarms.get(config.FETCH_ALARM_NAME); // Use config.FETCH_ALARM_NAME
    if (!alarm) {
      await browser.alarms.create(config.FETCH_ALARM_NAME, { delayInMinutes: 0.2, periodInMinutes: config.FETCH_INTERVAL_MINUTES }); // Use config for interval too
    }
  } catch (e) { console.error("MV2: Error setting up alarm:", e); }
}
browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === config.FETCH_ALARM_NAME) { // Use config.FETCH_ALARM_NAME
    await runJobCheck();
  }
});
async function sendNotification(job) { // Made async
  const jobUrl = `https://www.upwork.com/jobs/${job.ciphertext || job.id}`;
  const notificationOptions = {
    type: "basic", iconUrl: "icons/icon48.png", title: "New Upwork Job!",
    message: `${job.title}\nBudget: ${(job.budget && job.budget.amount !== null) ? job.budget.amount + ' ' + (job.budget.currencyCode || '') : 'N/A'}`,
    priority: 2
  };
  try {
    await browser.notifications.create(jobUrl, notificationOptions);
    // Play notification sound
    const audio = new Audio(browser.runtime.getURL("audio/notification.mp3")); // Ensure this path is correct
    audio.play().catch(e => console.warn("MV2: Error playing notification sound:", e));
  } catch (e) { console.error("MV2: Error creating notification:", e); }
}

browser.notifications.onClicked.addListener(async (notificationId) => { // Made async
  try {
    await browser.tabs.create({ url: notificationId });
    await browser.notifications.clear(notificationId);
  } catch (e) { console.error("MV2: Error handling notification click:", e); }
});

// --- Message Handlers ---

async function _handleManualCheck(request) {
  const queryFromPopup = request.userQuery || config.DEFAULT_USER_QUERY;
  await StorageManager.setCurrentUserQuery(queryFromPopup);
  await runJobCheck(queryFromPopup);
  return { status: "Manual check initiated and processing." };
}

async function _handleGetJobDetails(request) {
  if (!request.jobCiphertext) {
    throw new Error("jobCiphertext is required for getJobDetails action.");
  }
  console.log("MV2: Received getJobDetails request for:", request.jobCiphertext);
  const jobDetails = await _fetchAndProcessJobDetails(request.jobCiphertext);
  return { jobDetails: jobDetails };
}

const messageHandlers = {
  manualCheck: _handleManualCheck,
  getJobDetails: _handleGetJobDetails,
};

browser.runtime.onMessage.addListener(async (request, _sender) => {
  const handler = messageHandlers[request.action];
  if (handler) {
    try {
      return await handler(request);
    } catch (error) {
      console.error(`Background: Error handling action "${request.action}":`, error.message, error.stack);
      return { error: `Error during ${request.action} execution: ${error.message}` };
    }
  } else if (request.action) {
    console.warn(`MV2: No message handler found for action: ${request.action}`);
    return { error: `Unknown action: ${request.action}` };
  }
  // Return true for other async messages if sendResponse is used, or let it be undefined.
  // For the above, returning the promise from async function handles it.
});

setupAlarms();
runJobCheck(); // Perform an initial job check as soon as the extension loads.

// Renamed and adapted function to be called by the message listener
async function _fetchAndProcessJobDetails(jobCiphertext) {
  const apiResult = await UpworkAPI.fetchJobDetailsWithTokenRotation(jobCiphertext);

  if (apiResult && !apiResult.error) {
    //const jobDetails = apiResult.jobDetails; // removed unused variable
    console.log("MV2: Successfully fetched job details");

    // Check if popup is open before sending
    // This check is no longer strictly necessary here if we are directly responding to a message from the popup,
    // as the popup must be open to have sent the message.
    return apiResult.jobDetails;
  } else {
    console.error("MV2: Failed to fetch job details.", apiResult?.message);
    throw new Error(apiResult?.message || "Failed to fetch job details from API");
  }
}

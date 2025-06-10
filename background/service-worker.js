// background.js (Manifest V2 - Dynamic Token Attempt)
console.log("Background Script MV2 loaded - Dynamic Token Attempt.");
// UpworkAPI object is expected to be globally available from api/upwork-api.js

// --- WebRequest Listener to Modify Headers ---
chrome.webRequest.onBeforeSendHeaders.addListener(
  function(details) {
    if (details.url.startsWith(config.UPWORK_GRAPHQL_ENDPOINT_BASE) && details.method === "POST" && details.type === "xmlhttprequest") {
      let newHeaders = details.requestHeaders.filter(header => {
        const nameLower = header.name.toLowerCase(); // Ensure case-insensitive comparison
        return !nameLower.startsWith('sec-fetch-') && nameLower !== 'origin' && nameLower !== 'referer' && nameLower !== 'x-upwork-api-tenantid' && nameLower !== 'x-upwork-accept-language' && nameLower !== 'dnt';
      });
      newHeaders.push({ name: "Origin", value: config.UPWORK_DOMAIN });
      newHeaders.push({ name: "Referer", value: `${config.UPWORK_DOMAIN}/nx/search/jobs/` });
      newHeaders.push({ name: "X-Upwork-API-TenantId", value: config.X_UPWORK_API_TENANT_ID });
      newHeaders.push({ name: "X-Upwork-Accept-Language", value: "en-US" });
      newHeaders.push({ name: "DNT", value: "1" });
      const uaIndex = newHeaders.findIndex(h => h.name.toLowerCase() === 'user-agent'); // Find existing User-Agent
      const targetUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";
      if (uaIndex > -1) newHeaders[uaIndex].value = targetUA; else newHeaders.push({ name: "User-Agent", value: targetUA });
      const targetAcceptLang = "en-US,en;q=0.9,hr;q=0.8,sr-Latn-RS;q=0.7,sr;q=0.6,sh;q=0.5,sr-Cyrl-RS;q=0.4,sr-Cyrl-BA;q=0.3,en-GB;q=0.2";
      const alIndex = newHeaders.findIndex(h => h.name.toLowerCase() === 'accept-language');
      if (alIndex > -1) newHeaders[alIndex].value = targetAcceptLang; else newHeaders.push({ name: "Accept-Language", value: targetAcceptLang });
      return { requestHeaders: newHeaders };
    }
    return { cancel: false }; // Don't block other requests
  },
  { urls: [config.TARGET_GRAPHQL_URL_PATTERN] },
  ["blocking", "requestHeaders", "extraHeaders"]
);

// --- Main Job Checking Logic (runJobCheck) ---
async function runJobCheck(triggeredByUserQuery) {
  console.log("MV2: Attempting runJobCheck (Direct Background with token loop)...");
  await StorageManager.setMonitorStatus("Checking...");
  
  // Use the passed query or get from storage
  const userQueryToUse = triggeredByUserQuery ||
    await StorageManager.getCurrentUserQuery() || // Use StorageManager
    config.DEFAULT_USER_QUERY; // Use config object
    
  console.log("MV2: Using query for check:", userQueryToUse);

  const candidateTokens = await UpworkAPI.getAllPotentialApiTokens();
  if (!candidateTokens || candidateTokens.length === 0) {
    console.error("MV2: Cannot run job check, no candidate tokens found.");
    console.log("MV2: Using query for check:", userQueryToUse);
    
    // Open Upwork search page to help re-establish tokens
    const searchUrl = constructUpworkSearchURL(userQueryToUse, config.DEFAULT_CONTRACTOR_TIERS_GQL, config.DEFAULT_SORT_CRITERIA);
    chrome.tabs.create({ url: searchUrl });
    await StorageManager.setMonitorStatus("Error: No API Tokens.");
    return;
  }
  
  let fetchedJobs = null;
  let successfulToken = null;

  for (const token of candidateTokens) {
    console.log(`MV2: Trying token ${token.substring(0, 15)}...`);
    try {
      const result = await UpworkAPI.fetchUpworkJobsDirectly(token, userQueryToUse);
      if (result && !result.error) { // Check if result is not an error object
        fetchedJobs = result; // This is the array of job objects
        successfulToken = token;
        console.log(`MV2: Successfully fetched jobs with token ${successfulToken.substring(0,15)}...`);
        break; // Exit loop on first successful fetch
      } else {
        // Log specific error from fetchUpworkJobsDirectly if an error object was returned
        if (result && result.graphqlErrors) {
          console.warn(`MV2: GraphQL error with token ${token.substring(0,15)}... - ${JSON.stringify(result.graphqlErrors)}`);
          if (result.graphqlErrors[0]?.extensions?.classification === "ExecutionAborted") {
             // This is the "OAuth2 client does not have permission" error, likely a bad token for fields
             console.log(`Token ${token.substring(0,15)}... likely lacks field permissions. Trying next.`);
          }
        } else if (result && result.status) {
          console.warn(`MV2: HTTP error ${result.status} with token ${token.substring(0,15)}... Trying next.`);
        } else if (result && result.networkError) {
           console.warn(`MV2: Network error with token ${token.substring(0,15)}... Trying next.`);
        }
      }
    } catch (error) { // Should not happen if fetchUpworkJobsDirectly catches its own errors
      console.error(`MV2: Unexpected error trying token ${token.substring(0,15)}...:`, error.message);
    }
  }

  if (!successfulToken || fetchedJobs === null) {
    console.error("MV2: All candidate tokens failed or returned no valid job data.");
    await StorageManager.setMonitorStatus("Error: All tokens failed.");
    // Open Upwork search page to help re-establish tokens (using config defaults)
    const searchUrl = constructUpworkSearchURL(userQueryToUse, config.DEFAULT_CONTRACTOR_TIERS_GQL, config.DEFAULT_SORT_CRITERIA);
    chrome.tabs.create({ url: searchUrl });
    chrome.runtime.sendMessage({ action: "updatePopupDisplay" }).catch(e => {}); // Update popup with error
    return;
  }
  
  // Apply client-side title exclusion filter (marking instead of removing)
  if (fetchedJobs && fetchedJobs.length > 0 && config.TITLE_EXCLUSION_STRINGS.length > 0) {
    const originalCount = fetchedJobs.length;
    let excludedCount = 0;
    fetchedJobs = fetchedJobs.map(job => {
      const titleLower = (job.title || "").toLowerCase(); // Ensure title is lowercase for comparison
      const isExcluded = config.TITLE_EXCLUSION_STRINGS.some(excludeString => titleLower.includes(excludeString));
      if (isExcluded) {
        excludedCount++;
        // Add a flag to the job object instead of filtering it out
        return { ...job, isExcludedByTitleFilter: true };
      }
      return job;
    });
    console.log(`MV2: Marked ${excludedCount} jobs based on title exclusion filter out of ${originalCount}.`);
  }


  // --- Deduplication and Notification (using fetchedJobs) ---
  const historicalSeenJobIds = await StorageManager.getSeenJobIds();
  const deletedJobIds = await StorageManager.getDeletedJobIds();

  // Filter out jobs that are already seen OR have been explicitly deleted by the user from the *fetched* list
  const allNewOrUpdatedJobs = fetchedJobs.filter(job =>
    job && job.id && !historicalSeenJobIds.has(job.id) && !deletedJobIds.has(job.id)
  );
  // From these, determine which are truly new AND notifiable (not excluded by title filter)
  const notifiableNewJobs = allNewOrUpdatedJobs.filter(job => !job.isExcludedByTitleFilter);

  // Update seenJobIds if any jobs were fetched
  if (fetchedJobs && fetchedJobs.length > 0) {
    await StorageManager.addSeenJobIds(fetchedJobs.map(j => j.id).filter(id => id != null));
  }

  if (notifiableNewJobs.length > 0) {
    notifiableNewJobs.forEach(job => sendNotification(job));
  }
  console.log(`MV2 DirectBG: Token Loop. Found ${allNewOrUpdatedJobs.length} new/updated jobs, ${notifiableNewJobs.length} are notifiable.`);

  // Update storage using StorageManager
  await StorageManager.setMonitorStatus(`Checked. New (notifiable): ${notifiableNewJobs.length}`);
  await StorageManager.setNewJobsInLastRun(notifiableNewJobs.length);
  await StorageManager.setLastCheckTimestamp(Date.now());
  await StorageManager.setRecentFoundJobs(fetchedJobs ? fetchedJobs.filter(job => job && job.id && !deletedJobIds.has(job.id)) : []);

  // In MV2, chrome.runtime.sendMessage does NOT return a Promise.
  // Remove the .catch() as it's not valid.
  chrome.runtime.sendMessage({ action: "updatePopupDisplay" });
}


// --- Test Function, onInstalled, Alarms, Notifications, onMessage (remain the same) ---
async function testFetchJobs() {
  console.log("MV2: Running testFetchJobs (Direct Background Attempt)...");
  await runJobCheck();
}

chrome.runtime.onInstalled.addListener((details) => {
  console.log("MV2: Extension installed or updated:", details.reason);
  StorageManager.initializeStorage(config.DEFAULT_USER_QUERY);
  setupAlarms(); // Always set up alarms on install/update
});

function setupAlarms() {
  chrome.alarms.get(config.FETCH_ALARM_NAME, (alarm) => { // Use config.FETCH_ALARM_NAME
    if (!alarm) {
      chrome.alarms.create(config.FETCH_ALARM_NAME, { delayInMinutes: 0.2, periodInMinutes: config.FETCH_INTERVAL_MINUTES }); // Use config for interval too
    }
  });
}
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === config.FETCH_ALARM_NAME) { // Use config.FETCH_ALARM_NAME
    await runJobCheck();
  }
});
function sendNotification(job) {
  const jobUrl = `https://www.upwork.com/jobs/${job.ciphertext || job.id}`;
  const notificationOptions = {
    type: "basic", iconUrl: "icons/icon48.png", title: "New Upwork Job!",
    message: `${job.title}\nBudget: ${(job.budget && job.budget.amount != null) ? job.budget.amount + ' ' + (job.budget.currencyCode || '') : 'N/A'}`,
    priority: 2
  };
  chrome.notifications.create(jobUrl, notificationOptions);
}
chrome.notifications.onClicked.addListener((notificationId) => {
  chrome.tabs.create({ url: notificationId });
  chrome.notifications.clear(notificationId);
});
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "manualCheck") {
    const queryFromPopup = request.userQuery || config.DEFAULT_USER_QUERY; // Use config

    StorageManager.setCurrentUserQuery(queryFromPopup)
      .then(async () => { // Added async here
        // runJobCheck is async, ensure its errors are caught.
        try {
          await runJobCheck(queryFromPopup);
          if (sendResponse) sendResponse({ status: "Manual check initiated and processing." });
        } catch (error) {
          console.error("Background: Error during manual runJobCheck:", error);
          if (sendResponse) sendResponse({ error: "Error during manual job check execution." });
        }
      })
      .catch(error => { // Catch errors from setCurrentUserQuery itself
        console.error("Background: Error setting currentUserQuery for manual check:", error.message);
        if (sendResponse) sendResponse({ error: "Failed to save query before manual check." });
      });

    return true; // Crucial: indicates that sendResponse will be called asynchronously.
  }
  // Return false or nothing for synchronous messages or unhandled actions.
});
setupAlarms();
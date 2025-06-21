// background.js (Manifest V2 - Dynamic Token Attempt)
console.log("Background Script MV2 loaded - Dynamic Token Attempt.");
// --- WebRequest Listener to Modify Headers ---
browser.webRequest.onBeforeSendHeaders.addListener(
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
  ["blocking", "requestHeaders"]
);

let isJobCheckRunning = false; // Flag to prevent concurrent runs

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
      await StorageManager.setMonitorStatus("Error: All tokens failed.");
      // Open Upwork search page to help re-establish tokens
      try {
        const searchUrl = constructUpworkSearchURL(userQueryToUse, config.DEFAULT_CONTRACTOR_TIERS_GQL, config.DEFAULT_SORT_CRITERIA);
        await browser.tabs.create({ url: searchUrl });
        const popupViewsOnError = browser.extension.getViews({ type: "popup" });
        if (popupViewsOnError && popupViewsOnError.length > 0) {
          await browser.runtime.sendMessage({ action: "updatePopupDisplay" });
        } else {
          console.log("MV2: Popup not open, skipping updatePopupDisplay message after API token failure.");
        }
      } catch (e) { console.warn("MV2: Error trying to open tab or send updatePopupDisplay message:", e); }
      return; // Exit runJobCheck; 'finally' block will execute before returning
    }
    
    // Apply client-side title exclusion and skill-based low-priority marking
    if (fetchedJobs && fetchedJobs.length > 0) {
      const originalJobCount = fetchedJobs.length;
      let titleExcludedCount = 0;
      let skillLowPriorityCount = 0;
      let clientCountryLowPriorityCount = 0;

      fetchedJobs = fetchedJobs.map(job => {
        let newJobData = { ...job, isExcludedByTitleFilter: false, isLowPriorityBySkill: false, isLowPriorityByClientCountry: false };

        // 1. Apply TITLE based exclusion
        const titleLower = (job.title || "").toLowerCase(); // Ensure title is lowercase for comparison
        if (config.TITLE_EXCLUSION_STRINGS.length > 0 && config.TITLE_EXCLUSION_STRINGS.some(excludeString => titleLower.includes(excludeString))) {
          newJobData.isExcludedByTitleFilter = true;
          titleExcludedCount++;
        }

        // 2. Apply SKILL based low-priority marking
        // Ensure job.ontologySkills is an array and has items.
        // The API response shows skills under job.ontologySkills, each skill object has a prefLabel.
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
      console.log(`MV2: Processed ${originalJobCount} jobs. Marked ${titleExcludedCount} as excluded by title. Marked ${skillLowPriorityCount} as low-priority by skill. Marked ${clientCountryLowPriorityCount} as low-priority by client country.`);
    }


    // --- Deduplication and Notification (using fetchedJobs) ---
    const historicalSeenJobIds = await StorageManager.getSeenJobIds();
    const deletedJobIds = await StorageManager.getDeletedJobIds();
    let currentCollapsedJobIds = await StorageManager.getCollapsedJobIds(); // Get current collapsed IDs

    // Filter out jobs that are already seen OR have been explicitly deleted by the user from the *fetched* list
    const allNewOrUpdatedJobs = fetchedJobs.filter(job =>
      job && job.id && !historicalSeenJobIds.has(job.id) && !deletedJobIds.has(job.id)
    );
    // From these, determine which are truly new AND notifiable (not excluded by title filter)
    const notifiableNewJobs = allNewOrUpdatedJobs.filter(job =>
      !job.isExcludedByTitleFilter && !job.isLowPriorityBySkill && !job.isLowPriorityByClientCountry && job.applied !== true
    );

    // Update seenJobIds if any jobs were fetched
    if (fetchedJobs && fetchedJobs.length > 0) {
      const newJobIdsToMarkSeen = [];
      fetchedJobs.forEach(job => {
        if (job && job.id && !historicalSeenJobIds.has(job.id)) {
          newJobIdsToMarkSeen.push(job.id);
          // If it's a new, low-priority job OR a new "Filtered" (excluded by title) job,
          // add to collapsedJobIds so it starts collapsed in the popup.
          if (
              (job.isLowPriorityBySkill || job.isLowPriorityByClientCountry || job.isExcludedByTitleFilter) &&
              !currentCollapsedJobIds.has(job.id)) {
            currentCollapsedJobIds.add(job.id);
          }
        }
      });
      await StorageManager.addSeenJobIds(newJobIdsToMarkSeen);
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
    await StorageManager.setCollapsedJobIds(Array.from(currentCollapsedJobIds)); // Save updated collapsed IDs

    // Send message to popup at the end of successful processing
    try {
      // Check if the popup is open before trying to send a message.
      const popupViewsOnSuccess = browser.extension.getViews({ type: "popup" });
      if (popupViewsOnSuccess && popupViewsOnSuccess.length > 0) {
        await browser.runtime.sendMessage({ action: "updatePopupDisplay" });
      } else {
        console.log("MV2: Popup not open, skipping updatePopupDisplay message after job check.");
      }
    } catch (e) { console.warn("MV2: Error during conditional send of updatePopupDisplay message post-check:", e); }

  } finally {
    isJobCheckRunning = false;
    console.log("MV2: runJobCheck finished. isJobCheckRunning set to false.");
  }
}


// --- Test Function, onInstalled, Alarms, Notifications, onMessage (remain the same) ---
async function testFetchJobs() {
  console.log("MV2: Running testFetchJobs (Direct Background Attempt)...");
  await runJobCheck();
}

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
    message: `${job.title}\nBudget: ${(job.budget && job.budget.amount != null) ? job.budget.amount + ' ' + (job.budget.currencyCode || '') : 'N/A'}`,
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


// Updated onMessage listener to use async/await for responses
browser.runtime.onMessage.addListener(async (request, sender) => { // Consolidated listener
  if (request.action === "manualCheck") {
    const queryFromPopup = request.userQuery || config.DEFAULT_USER_QUERY; // Use config
    try {
      await StorageManager.setCurrentUserQuery(queryFromPopup);
      await runJobCheck(queryFromPopup);
      return { status: "Manual check initiated and processing." }; // This is the response
    } catch (error) {
      console.error("Background: Error during manual check:", error.message, error.stack);
      return { error: `Error during manual job check execution: ${error.message}` };
    }
  } else if (request.action === "getJobDetails" && request.jobCiphertext) {
    console.log("MV2: Received getJobDetails request for:", request.jobCiphertext);
    try {
      const jobDetails = await _fetchAndProcessJobDetails(request.jobCiphertext);
      return { jobDetails: jobDetails }; // This will be the response to the popup
    } catch (error) {
      console.error("MV2: Error processing getJobDetails in background:", error.message);
      return { jobDetails: null, error: error.message || "Failed to fetch job details" };
    }
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
    const jobDetails = apiResult.jobDetails;
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

// background.js (Manifest V2 - Direct Background Fetch Attempt)
console.log("Background Script MV2 loaded - Direct BG Fetch Attempt.");

const UPWORK_DOMAIN = "https://www.upwork.com";
const PREFERRED_TOKEN_COOKIE_NAME = "643e8096sb";
const FALLBACK_TOKEN_COOKIE_NAME = "oauth2_global_js_token";
const UPWORK_GRAPHQL_ENDPOINT_BASE = "https://www.upwork.com/api/graphql/v1";
const TARGET_GRAPHQL_URL_PATTERN = "*://*.upwork.com/api/graphql/v1*";
const X_UPWORK_API_TENANT_ID = "424307183201796097";
const DEFAULT_USER_QUERY = 'NOT "react" NOT "next.js" NOT "wix" "web vitals" OR "CLS" OR "INP" OR "LCP" OR "pagespeed" OR "Page speed" OR "Shopify speed" OR "Wordpress speed" OR "website speed"';


// --- Token Retrieval ---
async function getUpworkApiToken() {
  return new Promise(async (resolve) => {
    let token = null;
    let preferredCookie = await new Promise(r => chrome.cookies.get({ url: UPWORK_DOMAIN, name: PREFERRED_TOKEN_COOKIE_NAME }, c => r(c)));
    if (preferredCookie && preferredCookie.value) {
      // console.log(`Token from PREFERRED cookie (${PREFERRED_TOKEN_COOKIE_NAME}):`, preferredCookie.value.substring(0, 20) + "...");
      token = preferredCookie.value;
    } else {
      console.warn(`Preferred token cookie (${PREFERRED_TOKEN_COOKIE_NAME}) not found. Trying fallback.`);
      let fallbackCookie = await new Promise(r => chrome.cookies.get({ url: UPWORK_DOMAIN, name: FALLBACK_TOKEN_COOKIE_NAME }, c => r(c)));
      if (fallbackCookie && fallbackCookie.value) {
        // console.log(`Token from FALLBACK cookie (${FALLBACK_TOKEN_COOKIE_NAME}):`, fallbackCookie.value.substring(0, 20) + "...");
        token = fallbackCookie.value;
      }
    }
    if (token) resolve(token);
    else {
      console.warn("No Upwork API token cookie found.");
      chrome.storage.local.set({ monitorStatus: "Error: API Token not found." });
      resolve(null);
    }
  });
}

// --- WebRequest Listener to Modify Headers ---
chrome.webRequest.onBeforeSendHeaders.addListener(
  function(details) {
    if (details.url.startsWith(UPWORK_GRAPHQL_ENDPOINT_BASE) && details.method === "POST" && details.type === "xmlhttprequest") {
      // console.log("webRequest: Intercepting GraphQL POST request:", details.url); // Can be noisy
      let newHeaders = details.requestHeaders.filter(header => {
        const nameLower = header.name.toLowerCase();
        return !nameLower.startsWith('sec-fetch-') && nameLower !== 'origin' && nameLower !== 'referer';
      });
      newHeaders.push({ name: "Origin", value: UPWORK_DOMAIN });
      newHeaders.push({ name: "Referer", value: `${UPWORK_DOMAIN}/nx/search/jobs/` });
      newHeaders.push({ name: "X-Upwork-API-TenantId", value: X_UPWORK_API_TENANT_ID });
      newHeaders.push({ name: "X-Upwork-Accept-Language", value: "en-US" });
      newHeaders.push({ name: "DNT", value: "1" });
      const uaIndex = newHeaders.findIndex(h => h.name.toLowerCase() === 'user-agent');
      const targetUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36"; // Example, ensure it matches a common UA
      if (uaIndex > -1) newHeaders[uaIndex].value = targetUA;
      else newHeaders.push({ name: "User-Agent", value: targetUA });
      const targetAcceptLang = "en-US,en;q=0.9,hr;q=0.8,sr-Latn-RS;q=0.7,sr;q=0.6,sh;q=0.5,sr-Cyrl-RS;q=0.4,sr-Cyrl-BA;q=0.3,en-GB;q=0.2";
      const alIndex = newHeaders.findIndex(h => h.name.toLowerCase() === 'accept-language');
      if (alIndex > -1) newHeaders[alIndex].value = targetAcceptLang;
      else newHeaders.push({ name: "Accept-Language", value: targetAcceptLang });
      return { requestHeaders: newHeaders };
    }
    return { cancel: false };
  },
  { urls: [TARGET_GRAPHQL_URL_PATTERN] },
  ["blocking", "requestHeaders", "extraHeaders"]
);

// --- Fetching Jobs ---
async function fetchUpworkJobsDirectly(bearerToken, userQuery) { // Added userQuery parameter
  const endpoint = `${UPWORK_GRAPHQL_ENDPOINT_BASE}?alias=userJobSearch`;
  const fullRawQueryString = `
  query UserJobSearch($requestVariables: UserJobSearchV1Request!) {
    search {
      universalSearchNuxt {
        userJobSearchV1(request: $requestVariables) {
          paging { total offset count }
          results {
            id title description relevanceEncoded applied # Ensure 'applied' is requested
            ontologySkills { uid prefLabel prettyName: prefLabel }
            connectPrice
            upworkHistoryData { client { paymentVerificationStatus country totalSpent { amount } totalFeedback } }
            jobTile { job { id ciphertext: cipherText publishTime createTime jobType hourlyBudgetMin hourlyBudgetMax fixedPriceAmount { amount isoCurrencyCode } } }
          }
        }
      }
    }
  }`;
  const variables = {
    requestVariables: {
      userQuery: userQuery || DEFAULT_USER_QUERY, // Use passed query or default
      contractorTier: ["IntermediateLevel", "ExpertLevel"], // You might want to make these configurable too
      sort: "recency",
      highlight: false, // As per your previous code; can be true if preferred
      paging: { offset: 0, count: 20 },
    },
  };
  const graphqlPayload = { query: fullRawQueryString, variables: variables };
  const requestHeadersForFetch = {
    "Authorization": `Bearer ${bearerToken}`,
    "Content-Type": "application/json",
    "Accept": "*/*",
  };

  console.log(`DirectBG: Attempting fetch for query: "${userQuery}". Payload start:`, JSON.stringify(graphqlPayload).substring(0, 150) + "...");
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: requestHeadersForFetch,
      body: JSON.stringify(graphqlPayload),
    });
    if (!response.ok) {
      const responseBodyText = await response.text();
      console.error(`DirectBG: API request failed. Status: ${response.status}`, responseBodyText.substring(0, 500));
      await new Promise(resolve => chrome.storage.local.set({ monitorStatus: `Error: API Fail (${response.status})` }, resolve));
      return null;
    }
    const data = await response.json();
    if (data.errors) {
      console.error("DirectBG: GraphQL API errors:", data.errors);
      await new Promise(resolve => chrome.storage.local.set({ monitorStatus: "Error: GraphQL API Err." }, resolve));
      return null;
    }
    if (data.data?.search?.universalSearchNuxt?.userJobSearchV1?.results) {
      let jobsData = data.data.search.universalSearchNuxt.userJobSearchV1.results;
      console.log(`DirectBG: Successfully fetched ${jobsData.length} raw jobs.`);

      // Filter out jobs where 'applied' is true
      const unappliedJobsData = jobsData.filter(job => job.applied !== true);
      console.log(`DirectBG: Filtered out applied jobs. Remaining: ${unappliedJobsData.length} jobs.`);

      return unappliedJobsData.map(job => ({
        id: job.jobTile.job.ciphertext || job.jobTile.job.id,
        ciphertext: job.jobTile.job.ciphertext,
        title: job.title,
        description: job.description,
        postedOn: job.jobTile.job.publishTime || job.jobTile.job.createTime,
        applied: job.applied, // Keep this info if needed for display, though we filter
        budget: {
            amount: job.jobTile.job.fixedPriceAmount?.amount || job.jobTile.job.hourlyBudgetMin || job.jobTile.job.hourlyBudgetMax,
            currencyCode: job.jobTile.job.fixedPriceAmount?.isoCurrencyCode || 'USD',
            type: job.jobTile.job.jobType
        },
        client: {
            paymentVerificationStatus: job.upworkHistoryData?.client?.paymentVerificationStatus,
            country: job.upworkHistoryData?.client?.country,
            totalSpent: job.upworkHistoryData?.client?.totalSpent?.amount || 0,
            rating: job.upworkHistoryData?.client?.totalFeedback,
        },
        skills: job.ontologySkills ? job.ontologySkills.map(skill => ({ name: skill.prettyName || skill.prefLabel })) : [],
        _fullJobData: job
      }));
    } else {
      console.warn("DirectBG: No jobs data in expected structure:", data);
      return [];
    }
  } catch (error) {
    console.error("DirectBG: Network error fetching jobs:", error);
    await new Promise(resolve => chrome.storage.local.set({ monitorStatus: "Error: Network Fetch." }, resolve));
    return null;
  }
}

// --- Main Job Checking Logic ---
async function runJobCheck(triggeredByUserQuery) { // Optional: query passed from manual check
  console.log("MV2: Attempting runJobCheck (Direct Background)...");
  await new Promise(resolve => chrome.storage.local.set({ monitorStatus: "Checking...", lastCheckTimestamp: Date.now() }, resolve));

  const token = await getUpworkApiToken();
  if (!token) {
    console.error("MV2: Cannot run job check, token missing.");
    return;
  }

  let userQueryToUse = triggeredByUserQuery;
  if (!userQueryToUse) {
    const storage = await new Promise(resolve => chrome.storage.local.get(['currentUserQuery'], r => resolve(r)));
    userQueryToUse = storage.currentUserQuery || DEFAULT_USER_QUERY;
  }
  console.log("MV2: Using query for check:", userQueryToUse);


  let fetchedJobs = null;
  try {
    fetchedJobs = await fetchUpworkJobsDirectly(token, userQueryToUse); // Pass the query
  } catch (error) {
    console.error("MV2: Error in runJobCheck from fetchUpworkJobsDirectly:", error.message);
    await new Promise(resolve => chrome.storage.local.set({ monitorStatus: "Error: Fetch call failed." }, resolve));
    return;
  }

  if (fetchedJobs === null || !Array.isArray(fetchedJobs)) {
    console.error("MV2: Job check failed or returned invalid data.");
    return;
  }

  const storageResult = await new Promise(resolve => chrome.storage.local.get(['seenJobIds'], r => resolve(r)));
  const historicalSeenJobIds = new Set(storageResult.seenJobIds || []);
  const trulyNewJobs = fetchedJobs.filter(job => job && job.id && !historicalSeenJobIds.has(job.id));

  if (fetchedJobs.length > 0 || trulyNewJobs.length > 0) { // Log even if no new jobs but some were fetched
    const currentFetchJobIds = fetchedJobs.map(j => j.id).filter(id => id != null);
    const updatedSeenJobIds = new Set([...Array.from(historicalSeenJobIds), ...currentFetchJobIds]);
    const MAX_SEEN_IDS = 500;
    const prunedSeenJobIdsArray = Array.from(updatedSeenJobIds).slice(-MAX_SEEN_IDS);
    await new Promise(resolve => chrome.storage.local.set({ seenJobIds: prunedSeenJobIdsArray }, resolve));
    // console.log(`MV2: Dedup. History: ${historicalSeenJobIds.size}, Fetched (unapplied): ${fetchedJobs.length}, New: ${trulyNewJobs.length}, Stored: ${prunedSeenJobIdsArray.length}`);
  } else {
    // console.log("MV2: No jobs fetched to update seenJobIds.");
  }


  // ***** NEW: Store the 5 most recent "trulyNewJobs" for the popup *****
  let recentJobsForPopup = [];
  if (trulyNewJobs.length > 0) {
    console.log(`MV2 DirectBG: Found ${trulyNewJobs.length} truly new (and unapplied) jobs.`);
    trulyNewJobs.forEach(job => sendNotification(job));
    // Store the actual job objects, limited to 5. These are already mapped.
    recentJobsForPopup = trulyNewJobs.slice(0, 5);
  } else {
    console.log("MV2 DirectBG: No new unapplied jobs found after deduplication.");
  }

  await new Promise(resolve => chrome.storage.local.set({
    monitorStatus: `Checked. New: ${trulyNewJobs.length}`,
    newJobsInLastRun: trulyNewJobs.length,
    lastCheckTimestamp: Date.now(),
    recentFoundJobs: recentJobsForPopup // ***** Store the jobs for popup *****
  }, resolve));
  //console.log("Background: Stored recentFoundJobs for popup:", JSON.stringify(recentJobsForPopup));

  // ***** NEW: Send message to popup to update itself *****
  chrome.runtime.sendMessage({ action: "updatePopupDisplay" }, response => {
    if (chrome.runtime.lastError) {
      // This error is common if the popup is not open. It's fine.
      // console.log("Background: Popup not open to receive updateDisplay message, or other error:", chrome.runtime.lastError.message);
    } else {
      // console.log("Background: Sent updatePopupDisplay message, response:", response);
    }
  });


  if (trulyNewJobs.length > 0) {
    console.log(`MV2 DirectBG: Found ${trulyNewJobs.length} truly new (and unapplied) jobs.`);
    trulyNewJobs.forEach(job => sendNotification(job));
  } else {
    console.log("MV2 DirectBG: No new unapplied jobs found after deduplication.");
  }

  await new Promise(resolve => chrome.storage.local.set({
    monitorStatus: `Checked. New: ${trulyNewJobs.length}`,
    newJobsInLastRun: trulyNewJobs.length,
    lastCheckTimestamp: Date.now()
  }, resolve));
}

// --- Test Function ---
async function testFetchJobs() { // Test will use the currently stored or default query
  console.log("MV2: Running testFetchJobs (Direct Background Attempt)...");
  await runJobCheck();
}

// --- Initial setup on extension installation ---
chrome.runtime.onInstalled.addListener((details) => {
  console.log("MV2: Extension installed or updated:", details.reason);
  chrome.storage.local.set({
    monitorStatus: "Initializing...",
    lastCheckTimestamp: null,
    newJobsInLastRun: 0,
    seenJobIds: [],
    currentUserQuery: DEFAULT_USER_QUERY // Set default query on install
  }, () => {
    if (chrome.runtime.lastError) console.error("Error setting initial storage:", chrome.runtime.lastError);
    console.log("MV2: Initial storage set. Default query:", DEFAULT_USER_QUERY);
    setupAlarms();
  });
});

// --- Alarms ---
const FETCH_ALARM_NAME = "fetchUpworkJobsAlarm_MV2";
function setupAlarms() {
  chrome.alarms.get(FETCH_ALARM_NAME, (alarm) => {
    if (!alarm) {
      console.log("MV2: Creating fetch alarm (every 1 minute).");
      chrome.alarms.create(FETCH_ALARM_NAME, {
          delayInMinutes: 0.2,
          periodInMinutes: 1
      });
    } else { console.log("MV2: Fetch alarm already exists."); }
  });
}
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === FETCH_ALARM_NAME) {
    console.log("MV2: Alarm triggered:", alarm.name, new Date().toLocaleTimeString());
    await runJobCheck(); // Will use stored query
  }
});

// --- Notifications ---
function sendNotification(job) {
  const jobUrl = `https://www.upwork.com/jobs/${job.ciphertext || job.id}`;
  const notificationOptions = {
    type: "basic", iconUrl: "icons/icon48.png", title: "New Upwork Job!",
    message: `${job.title}\nBudget: ${(job.budget && job.budget.amount != null) ? job.budget.amount + ' ' + (job.budget.currencyCode || '') : 'N/A'}`,
    priority: 2
  };
  chrome.notifications.create(jobUrl, notificationOptions, (notificationId) => {
    if (chrome.runtime.lastError) console.error("Notification error:", chrome.runtime.lastError.message);
  });
}
chrome.notifications.onClicked.addListener((notificationId) => {
  chrome.tabs.create({ url: notificationId });
  chrome.notifications.clear(notificationId);
});

// --- Message listener for popup ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "manualCheck") {
    console.log("MV2: Received manualCheck request from popup with query:", request.userQuery);
    // If a query is sent from popup, use it for this check and save it for future alarm checks
    const queryFromPopup = request.userQuery || DEFAULT_USER_QUERY;
    chrome.storage.local.set({ currentUserQuery: queryFromPopup }, async () => {
        await runJobCheck(queryFromPopup); // Pass query to runJobCheck
        sendResponse({ status: "Manual check initiated with specified query." });
    });
    return true;
  }
});

setupAlarms();
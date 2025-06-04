// background.js (Manifest V2 - Dynamic Token Attempt)
console.log("Background Script MV2 loaded - Dynamic Token Attempt.");

const UPWORK_DOMAIN = "https://www.upwork.com";
// No longer relying on specific cookie names as primary here
const UPWORK_GRAPHQL_ENDPOINT_BASE = "https://www.upwork.com/api/graphql/v1";
const TARGET_GRAPHQL_URL_PATTERN = "*://*.upwork.com/api/graphql/v1*"; // For webRequest
const X_UPWORK_API_TENANT_ID = "424307183201796097";
const DEFAULT_USER_QUERY = 'NOT "react" NOT "next.js" NOT "wix" NOT "HubSpot" NOT "Webflow Website" NOT "Webflow Page" NOT "Squarespace Website" NOT "Squarespace Blog" NOT "Content Marketing" NOT "Guest Post" "CLS" OR "INP" OR "LCP" OR "pagespeed" OR "Page speed" OR "Shopify speed" OR "Wordpress speed" OR "site speed" OR "web optimization" OR "web vitals" OR "WebPageTest" OR "GTmetrix" OR "Lighthouse scores" OR "Google Lighthouse" OR "page load" OR "performance expert" OR "performance specialist" OR "performance audit" ';

// New: Client-side title exclusion filter
const TITLE_EXCLUSION_STRINGS = [
  "french speaking only", // Add strings to exclude, case-insensitive
  "SEO Optimization for",
  // e.g., "german required", "based in usa only"
].map(s => s.toLowerCase());


// --- Token Retrieval ---
async function getAllPotentialApiTokens() { // Renamed and modified to return an array
  return new Promise((resolve) => {
    chrome.cookies.getAll({ domain: "upwork.com" }, (cookies) => {
      if (chrome.runtime.lastError) {
        console.error("Error getting all cookies:", chrome.runtime.lastError.message);
        resolve([]); return;
      }
      if (!cookies || cookies.length === 0) {
        console.warn("No cookies found for upwork.com domain.");
        resolve([]); return;
      }

      let allOAuthTokens = [];
      for (const cookie of cookies) {
        if (cookie.value && cookie.value.startsWith("oauth2v2_")) {
          allOAuthTokens.push({ name: cookie.name, value: cookie.value });
        }
      }

      if (allOAuthTokens.length === 0) {
        console.warn("No cookies matching 'oauth2v2_' prefix found.");
        resolve([]); return;
      }

      // Prioritize tokens based on patterns or known good characteristics
      let prioritizedTokens = [];

      // 1. Tokens matching the "xxxxxxxxsb" pattern (and not known non-API tokens)
      const sbPatternTokens = allOAuthTokens.filter(t =>
        t.name.length === 10 && t.name.endsWith("sb") &&
        t.name !== "forterToken" // Example of a known token that might fit pattern but isn't for API auth
      );
      sbPatternTokens.forEach(t => prioritizedTokens.push(t.value));

      // 2. Other oauth2v2_ tokens, excluding known non-permissioned or general ones
      const otherPotentials = allOAuthTokens.filter(t =>
        !sbPatternTokens.some(sbt => sbt.name === t.name) && // Not already added
        t.name !== "oauth2_global_js_token" &&
        t.name !== "visitor_gql_token" &&
        t.name !== "visitor_innova_gql_token" &&
        !t.name.includes("master_access_token") &&
        !t.name.includes("_vt") // Nuxt view tokens
      );
      otherPotentials.forEach(t => prioritizedTokens.push(t.value));

      // 3. Fallback to oauth2_global_js_token if nothing else worked (least likely to have field perms)
      const globalJsToken = allOAuthTokens.find(t => t.name === "oauth2_global_js_token");
      if (globalJsToken && !prioritizedTokens.includes(globalJsToken.value)) {
        prioritizedTokens.push(globalJsToken.value);
      }
      
      // Remove duplicates that might have arisen if a token fit multiple categories
      const uniquePrioritizedTokens = [...new Set(prioritizedTokens)];

      console.log("Candidate API tokens (prioritized):", uniquePrioritizedTokens.map(t => t.substring(0,20) + "..."));
      resolve(uniquePrioritizedTokens);
    });
  });
}


// --- WebRequest Listener to Modify Headers ---
chrome.webRequest.onBeforeSendHeaders.addListener(
  function(details) {
    if (details.url.startsWith(UPWORK_GRAPHQL_ENDPOINT_BASE) && details.method === "POST" && details.type === "xmlhttprequest") {
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
      const targetUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";
      if (uaIndex > -1) newHeaders[uaIndex].value = targetUA; else newHeaders.push({ name: "User-Agent", value: targetUA });
      const targetAcceptLang = "en-US,en;q=0.9,hr;q=0.8,sr-Latn-RS;q=0.7,sr;q=0.6,sh;q=0.5,sr-Cyrl-RS;q=0.4,sr-Cyrl-BA;q=0.3,en-GB;q=0.2";
      const alIndex = newHeaders.findIndex(h => h.name.toLowerCase() === 'accept-language');
      if (alIndex > -1) newHeaders[alIndex].value = targetAcceptLang; else newHeaders.push({ name: "Accept-Language", value: targetAcceptLang });
      return { requestHeaders: newHeaders };
    }
    return { cancel: false };
  },
  { urls: [TARGET_GRAPHQL_URL_PATTERN] },
  ["blocking", "requestHeaders", "extraHeaders"]
);

// --- Fetching Jobs (fetchUpworkJobsDirectly - remains the same) ---
async function fetchUpworkJobsDirectly(bearerToken, userQuery) {
  // ... (this function is the same as your last working version that takes bearerToken and userQuery)
  // ... (it should return null on API/GraphQL error, or an array of jobs (possibly empty) on success)
  const endpoint = `${UPWORK_GRAPHQL_ENDPOINT_BASE}?alias=userJobSearch`;
  const fullRawQueryString = `
  query UserJobSearch($requestVariables: UserJobSearchV1Request!) {
    search {
      universalSearchNuxt {
        userJobSearchV1(request: $requestVariables) {
          paging { total offset count }
          results {
            id title description relevanceEncoded applied
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
      userQuery: userQuery || DEFAULT_USER_QUERY,
      contractorTier: ["IntermediateLevel", "ExpertLevel"],
      sort: "recency",
      highlight: false,
      paging: { offset: 0, count: 8 },
    },
  };
  const graphqlPayload = { query: fullRawQueryString, variables: variables };
  const requestHeadersForFetch = {
    "Authorization": `Bearer ${bearerToken}`,
    "Content-Type": "application/json",
    "Accept": "*/*",
  };

  // console.log(`DirectBG: Attempting fetch for query: "${userQuery}". Token: ${bearerToken.substring(0,20)}...`);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: requestHeadersForFetch,
      body: JSON.stringify(graphqlPayload),
    });
    if (!response.ok) {
      const responseBodyText = await response.text();
      console.warn(`DirectBG: API request failed with token ${bearerToken.substring(0,10)}... Status: ${response.status}`, responseBodyText.substring(0, 300));
      // Return a specific error object or null to indicate this token failed
      return { error: true, status: response.status, body: responseBodyText.substring(0, 300) };
    }
    const data = await response.json();
    if (data.errors) {
      console.warn(`DirectBG: GraphQL API errors with token ${bearerToken.substring(0,10)}...:`, data.errors);
      // Return a specific error object or null
      return { error: true, graphqlErrors: data.errors };
    }
    if (data.data?.search?.universalSearchNuxt?.userJobSearchV1?.results) {
      let jobsData = data.data.search.universalSearchNuxt.userJobSearchV1.results;
      const unappliedJobsData = jobsData.filter(job => job.applied !== true);
      // console.log(`DirectBG: Fetched ${jobsData.length} raw, ${unappliedJobsData.length} unapplied with token ${bearerToken.substring(0,10)}...`);
      return unappliedJobsData.map(job => ({ /* ... your mapping ... */
        id: job.jobTile.job.ciphertext || job.jobTile.job.id, ciphertext: job.jobTile.job.ciphertext, title: job.title, description: job.description, postedOn: job.jobTile.job.publishTime || job.jobTile.job.createTime, applied: job.applied,
        budget: { amount: job.jobTile.job.fixedPriceAmount?.amount || job.jobTile.job.hourlyBudgetMin || job.jobTile.job.hourlyBudgetMax, currencyCode: job.jobTile.job.fixedPriceAmount?.isoCurrencyCode || 'USD', type: job.jobTile.job.jobType },
        client: { paymentVerificationStatus: job.upworkHistoryData?.client?.paymentVerificationStatus, country: job.upworkHistoryData?.client?.country, totalSpent: job.upworkHistoryData?.client?.totalSpent?.amount || 0, rating: job.upworkHistoryData?.client?.totalFeedback, },
        skills: job.ontologySkills ? job.ontologySkills.map(skill => ({ name: skill.prettyName || skill.prefLabel })) : [],
        _fullJobData: job
      }));
    } else { return []; } // Success but no results
  } catch (error) { 
    console.error(`DirectBG: Network error with token ${bearerToken.substring(0,10)}...:`, error);
    return { error: true, networkError: error.message };
  }
}

// --- Main Job Checking Logic (runJobCheck) ---
async function runJobCheck(triggeredByUserQuery) {
  console.log("MV2: Attempting runJobCheck (Direct Background with token loop)...");
  await new Promise(resolve => chrome.storage.local.set({ monitorStatus: "Checking...", lastCheckTimestamp: Date.now() }, resolve));

  const candidateTokens = await getAllPotentialApiTokens();
  if (!candidateTokens || candidateTokens.length === 0) {
    console.error("MV2: Cannot run job check, no candidate tokens found.");
    await new Promise(resolve => chrome.storage.local.set({ monitorStatus: "Error: No API Tokens." }, resolve));
    return;
  }

  let userQueryToUse = triggeredByUserQuery;
  if (!userQueryToUse) {
    const storage = await new Promise(resolve => chrome.storage.local.get(['currentUserQuery'], r => resolve(r)));
    userQueryToUse = storage.currentUserQuery || DEFAULT_USER_QUERY;
  }
  console.log("MV2: Using query for check:", userQueryToUse);

  let fetchedJobs = null;
  let successfulToken = null;

  for (const token of candidateTokens) {
    console.log(`MV2: Trying token ${token.substring(0, 15)}...`);
    try {
      const result = await fetchUpworkJobsDirectly(token, userQueryToUse);
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
    await new Promise(resolve => chrome.storage.local.set({ monitorStatus: "Error: All tokens failed." }, resolve));
    chrome.runtime.sendMessage({ action: "updatePopupDisplay" }).catch(e => {}); // Update popup with error
    return;
  }
  
  // Apply client-side title exclusion filter (marking instead of removing)
  if (fetchedJobs && fetchedJobs.length > 0 && TITLE_EXCLUSION_STRINGS.length > 0) {
    const originalCount = fetchedJobs.length;
    let excludedCount = 0;
    fetchedJobs = fetchedJobs.map(job => {
      const titleLower = (job.title || "").toLowerCase();
      const isExcluded = TITLE_EXCLUSION_STRINGS.some(excludeString => titleLower.includes(excludeString));
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
  // (This part remains the same as your previous working version)
  const storageResult = await new Promise(resolve => chrome.storage.local.get(['seenJobIds'], r => resolve(r)));
  const historicalSeenJobIds = new Set(storageResult.seenJobIds || []);
  // Filter out jobs that are already seen
  const allNewOrUpdatedJobs = fetchedJobs.filter(job => job && job.id && !historicalSeenJobIds.has(job.id));
  // From these, determine which are truly new AND notifiable (not excluded by title filter)
  const notifiableNewJobs = allNewOrUpdatedJobs.filter(job => !job.isExcludedByTitleFilter);

  if (fetchedJobs.length > 0 || trulyNewJobs.length > 0) {
    const currentFetchJobIds = fetchedJobs.map(j => j.id).filter(id => id != null);
    const updatedSeenJobIds = new Set([...Array.from(historicalSeenJobIds), ...currentFetchJobIds]);
    const MAX_SEEN_IDS = 500;
    const prunedSeenJobIdsArray = Array.from(updatedSeenJobIds).slice(-MAX_SEEN_IDS);
    await new Promise(resolve => chrome.storage.local.set({ seenJobIds: prunedSeenJobIdsArray }, resolve));
  }

  if (notifiableNewJobs.length > 0) {
    notifiableNewJobs.forEach(job => sendNotification(job));
  }
  console.log(`MV2 DirectBG: Token Loop. Found ${allNewOrUpdatedJobs.length} new/updated jobs, ${notifiableNewJobs.length} are notifiable.`);

  await new Promise(resolve => chrome.storage.local.set({
    monitorStatus: `Checked. New (notifiable): ${notifiableNewJobs.length}`,
    newJobsInLastRun: notifiableNewJobs.length, // This count is for non-excluded new jobs
    lastCheckTimestamp: Date.now(),
    recentFoundJobs: fetchedJobs ? fetchedJobs.slice(0, 10) : [] // Store more, e.g., top 10, including marked ones
  }, resolve));
  chrome.runtime.sendMessage({ action: "updatePopupDisplay" }).catch(e => {});
}


// --- Test Function, onInstalled, Alarms, Notifications, onMessage (remain the same) ---
async function testFetchJobs() {
  console.log("MV2: Running testFetchJobs (Direct Background Attempt)...");
  await runJobCheck();
}
chrome.runtime.onInstalled.addListener((details) => {
  console.log("MV2: Extension installed or updated:", details.reason);
  chrome.storage.local.set({
    monitorStatus: "Initializing...", lastCheckTimestamp: null, newJobsInLastRun: 0, seenJobIds: [],
    currentUserQuery: DEFAULT_USER_QUERY
  }, () => {
    if (chrome.runtime.lastError) console.error("Error setting initial storage:", chrome.runtime.lastError);
    setupAlarms();
  });
});
const FETCH_ALARM_NAME = "fetchUpworkJobsAlarm_MV2";
function setupAlarms() {
  chrome.alarms.get(FETCH_ALARM_NAME, (alarm) => {
    if (!alarm) {
      chrome.alarms.create(FETCH_ALARM_NAME, { delayInMinutes: 0.2, periodInMinutes: 1 });
    }
  });
}
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === FETCH_ALARM_NAME) {
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
    const queryFromPopup = request.userQuery || DEFAULT_USER_QUERY;
    chrome.storage.local.set({ currentUserQuery: queryFromPopup }, async () => {
        await runJobCheck(queryFromPopup);
        sendResponse({ status: "Manual check initiated." });
    });
    return true;
  }
});
setupAlarms();
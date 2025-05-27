// background.js (Manifest V2 - Direct Background Fetch Attempt)
console.log("Background Script MV2 loaded - Direct BG Fetch Attempt.");

const UPWORK_DOMAIN = "https://www.upwork.com";
const PREFERRED_TOKEN_COOKIE_NAME = "643e8096sb"; // The cookie with the permissioned token
const FALLBACK_TOKEN_COOKIE_NAME = "oauth2_global_js_token";
const UPWORK_GRAPHQL_ENDPOINT_BASE = "https://www.upwork.com/api/graphql/v1";
const TARGET_GRAPHQL_URL_PATTERN = "*://*.upwork.com/api/graphql/v1*";
const X_UPWORK_API_TENANT_ID = "424307183201796097"; // Your Tenant ID

async function getUpworkApiToken() {
  return new Promise(async (resolve) => {
    let token = null;
    let preferredCookie = await new Promise(r => chrome.cookies.get({ url: UPWORK_DOMAIN, name: PREFERRED_TOKEN_COOKIE_NAME }, c => r(c)));
    if (preferredCookie && preferredCookie.value) {
      console.log(`Token from PREFERRED cookie (${PREFERRED_TOKEN_COOKIE_NAME}):`, preferredCookie.value.substring(0, 20) + "...");
      token = preferredCookie.value;
    } else {
      console.warn(`Preferred token cookie (${PREFERRED_TOKEN_COOKIE_NAME}) not found. Trying fallback.`);
      let fallbackCookie = await new Promise(r => chrome.cookies.get({ url: UPWORK_DOMAIN, name: FALLBACK_TOKEN_COOKIE_NAME }, c => r(c)));
      if (fallbackCookie && fallbackCookie.value) {
        console.log(`Token from FALLBACK cookie (${FALLBACK_TOKEN_COOKIE_NAME}):`, fallbackCookie.value.substring(0, 20) + "...");
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
      console.log("webRequest: Intercepting GraphQL POST request:", details.url);
      let newHeaders = details.requestHeaders.filter(header => {
        const nameLower = header.name.toLowerCase();
        // Filter out browser-added Origin, Referer, Sec-Fetch-*
        // We will add our own spoofed versions.
        return !nameLower.startsWith('sec-fetch-') &&
               nameLower !== 'origin' &&
               nameLower !== 'referer';
      });

      // Add spoofed/required headers based on working browser request
      newHeaders.push({ name: "Origin", value: UPWORK_DOMAIN });
      newHeaders.push({ name: "Referer", value: `${UPWORK_DOMAIN}/nx/search/jobs/` }); // Referer from your working example
      newHeaders.push({ name: "X-Upwork-API-TenantId", value: X_UPWORK_API_TENANT_ID });
      newHeaders.push({ name: "X-Upwork-Accept-Language", value: "en-US" });
      newHeaders.push({ name: "DNT", value: "1" }); // From your working example

      // User-Agent: fetch() will send one. If it needs to be specific, ensure it here or in fetch headers.
      // The one in your working example is:
      // "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36"
      // Let's ensure this exact one is used.
      const uaIndex = newHeaders.findIndex(h => h.name.toLowerCase() === 'user-agent');
      const targetUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";
      if (uaIndex > -1) newHeaders[uaIndex].value = targetUA;
      else newHeaders.push({ name: "User-Agent", value: targetUA });

      // Accept-Language from your working example:
      const targetAcceptLang = "en-US,en;q=0.9,hr;q=0.8,sr-Latn-RS;q=0.7,sr;q=0.6,sh;q=0.5,sr-Cyrl-RS;q=0.4,sr-Cyrl-BA;q=0.3,en-GB;q=0.2";
      const alIndex = newHeaders.findIndex(h => h.name.toLowerCase() === 'accept-language');
      if (alIndex > -1) newHeaders[alIndex].value = targetAcceptLang;
      else newHeaders.push({ name: "Accept-Language", value: targetAcceptLang });

      // Accept-Encoding from your working example (browser usually handles this well):
      // const targetAcceptEnc = "gzip, deflate, br, zstd";
      // if (!newHeaders.some(h => h.name.toLowerCase() === 'accept-encoding')) {
      //   newHeaders.push({ name: "Accept-Encoding", value: targetAcceptEnc });
      // }
      // It's often better to let the browser and fetch handle Accept-Encoding.

      console.log("webRequest: Final modified headers to be sent:", JSON.stringify(newHeaders.map(h=>({[h.name]:h.value}))));
      return { requestHeaders: newHeaders };
    }
    return { cancel: false };
  },
  { urls: [TARGET_GRAPHQL_URL_PATTERN] },
  ["blocking", "requestHeaders", "extraHeaders"]
);

/**
 * Fetches jobs directly from background script, relying on webRequest to fix headers.
 */
async function fetchUpworkJobsDirectly(bearerToken) {
  const endpoint = `${UPWORK_GRAPHQL_ENDPOINT_BASE}?alias=userJobSearch`;
  const fullRawQueryString = `
  query UserJobSearch($requestVariables: UserJobSearchV1Request!) {
    search {
      universalSearchNuxt {
        userJobSearchV1(request: $requestVariables) {
          paging { total offset count }
          facets { jobType { key value } workload { key value } clientHires { key value } durationV3 { key value } amount { key value } contractorTier { key value } contractToHire { key value } paymentVerified: payment { key value } proposals { key value } previousClients { key value } }
          results {
            id title description relevanceEncoded
            ontologySkills { uid parentSkillUid prefLabel prettyName: prefLabel freeText highlighted }
            isSTSVectorSearchResult connectPrice applied
            upworkHistoryData { client { paymentVerificationStatus country totalReviews totalFeedback hasFinancialPrivacy totalSpent { isoCurrencyCode amount } } freelancerClientRelation { lastContractRid companyName lastContractTitle } }
            jobTile { job { id ciphertext: cipherText jobType weeklyRetainerBudget hourlyBudgetMax hourlyBudgetMin hourlyEngagementType contractorTier sourcingTimestamp createTime publishTime enterpriseJob personsToHire premium totalApplicants hourlyEngagementDuration { rid label weeks mtime ctime } fixedPriceAmount { isoCurrencyCode amount } fixedPriceEngagementDuration { id rid label weeks ctime mtime } } }
          }
        }
      }
    }
  }`;
  const variables = {
    requestVariables: {
      userQuery: "NOT \"react\" NOT \"next.js\" NOT \"wix\" \"web vitals\" OR \"CLS\" OR \"INP\" OR \"LCP\" OR \"pagespeed\" OR \"Page speed\" OR \"Shopify speed\" OR \"Wordpress speed\" OR \"website speed\"",
      contractorTier: ["IntermediateLevel", "ExpertLevel"],
      sort: "recency",
      highlight: false,
      paging: { offset: 0, count: 8 },
    },
  };
  const graphqlPayload = { query: fullRawQueryString, variables: variables };

  const requestHeadersForFetch = { // Headers set by fetch itself
    "Authorization": `Bearer ${bearerToken}`,
    "Content-Type": "application/json",
    "Accept": "*/*", // Matches working browser request
    // User-Agent will be set by webRequest to match browser
    // DNT will be set by webRequest
  };

  console.log("DirectBG: Attempting to fetch jobs...");
  console.log("DirectBG: Payload:", JSON.stringify(graphqlPayload));
  console.log("DirectBG: Headers set by fetch():", requestHeadersForFetch);


  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: requestHeadersForFetch, // webRequest will modify these on-the-fly
      body: JSON.stringify(graphqlPayload),
    });

    if (!response.ok) {
      const responseBodyText = await response.text();
      console.error(`DirectBG: API request failed. Status: ${response.status}`, responseBodyText);
      // Also log actual headers received by server if possible (can't from client-side error)
      // Check network tab for what was actually sent vs what webRequest intended.
      await new Promise(resolve => chrome.storage.local.set({ monitorStatus: `Error: API DirectBG fail (${response.status})` }, resolve));
      return null;
    }

    const data = await response.json();

    if (data.errors) {
      console.error("DirectBG: GraphQL API returned errors:", data.errors);
      console.error("DirectBG: Query Sent:", graphqlPayload.query);
      console.error("DirectBG: Variables Sent:", graphqlPayload.variables);
      await new Promise(resolve => chrome.storage.local.set({ monitorStatus: "Error: GraphQL API DirectBG error." }, resolve));
      return null;
    }

    if (data.data?.search?.universalSearchNuxt?.userJobSearchV1?.results) {
      const jobsData = data.data.search.universalSearchNuxt.userJobSearchV1.results;
      console.log(`DirectBG: Successfully fetched ${jobsData.length} jobs.`);
      return jobsData.map(job => ({ /* your mapping logic here... */
        id: job.jobTile.job.ciphertext || job.jobTile.job.id, ciphertext: job.jobTile.job.ciphertext, original_id: job.id, title: job.title, description: job.description, postedOn: job.jobTile.job.publishTime || job.jobTile.job.createTime,
        budget: { amount: job.jobTile.job.fixedPriceAmount ? job.jobTile.job.fixedPriceAmount.amount : (job.jobTile.job.hourlyBudgetMin || job.jobTile.job.hourlyBudgetMax), currencyCode: job.jobTile.job.fixedPriceAmount ? job.jobTile.job.fixedPriceAmount.isoCurrencyCode : 'USD', type: job.jobTile.job.jobType },
        client: { paymentVerificationStatus: job.upworkHistoryData?.client?.paymentVerificationStatus, country: job.upworkHistoryData?.client?.country, totalSpent: job.upworkHistoryData?.client?.totalSpent?.amount || 0, rating: job.upworkHistoryData?.client?.totalFeedback, },
        skills: job.ontologySkills ? job.ontologySkills.map(skill => ({ name: skill.prettyName || skill.prefLabel })) : [],
        _fullJobData: job
      }));
    } else {
      console.warn("DirectBG: No jobs data in expected structure:", data);
      await new Promise(resolve => chrome.storage.local.set({ monitorStatus: "Warning: No jobs data DirectBG." }, resolve));
      return [];
    }
  } catch (error) {
    console.error("DirectBG: Error fetching jobs:", error);
    await new Promise(resolve => chrome.storage.local.set({ monitorStatus: "Error: Network DirectBG." }, resolve));
    return null;
  }
}

// --- Test Function ---
async function testFetchJobs() {
  console.log("MV2: Running testFetchJobs (Direct Background Attempt)...");
  await chrome.storage.local.set({ monitorStatus: "Testing Direct BG fetch..." });
  const token = await getUpworkApiToken();
  if (!token) {
    console.error("MV2: Cannot test, token missing.");
    await chrome.storage.local.set({ monitorStatus: "Test failed: Token missing." });
    return;
  }
  try {
    const jobs = await fetchUpworkJobsDirectly(token); // Call the direct fetch
    if (jobs) {
      console.log(`MV2 Test: Fetched ${jobs.length} jobs directly.`);
      if (jobs.length > 0) console.log("MV2 First job mapped (DirectBG):", jobs[0]);
      await chrome.storage.local.set({ monitorStatus: `Test DirectBG: Fetched ${jobs.length} jobs.` });
    } else {
      await chrome.storage.local.set({ monitorStatus: "Test DirectBG: No jobs array." });
    }
  } catch (error) {
    console.error("MV2: Error during testFetchJobs (DirectBG):", error.message);
    await chrome.storage.local.set({ monitorStatus: `Test DirectBG Error: ${error.message}` });
  }
}

// --- runJobCheck now uses the direct method ---
async function runJobCheck() {
  console.log("MV2: Attempting runJobCheck (Direct Background)...");
  await new Promise(resolve => chrome.storage.local.set({ monitorStatus: "Checking (DirectBG)...", lastCheckTimestamp: Date.now() }, resolve));
  const token = await getUpworkApiToken();
  if (!token) return;

  let fetchedJobs = null;
  try {
    fetchedJobs = await fetchUpworkJobsDirectly(token);
  } catch (error) {
    console.error("MV2: Error in runJobCheck (DirectBG):", error.message);
    await new Promise(resolve => chrome.storage.local.set({ monitorStatus: "Error (DirectBG): " + error.message }, resolve));
    return;
  }
  if (fetchedJobs === null || !Array.isArray(fetchedJobs)) { /* ... error handling ... */ return; }

  // Deduplication logic (same as before)
  const storageData = await new Promise(resolve => chrome.storage.local.get(['seenJobIds'], result => resolve(result)));
  const seenJobIds = new Set(storageData.seenJobIds || []);
  const trulyNewJobs = fetchedJobs.filter(job => job && job.id && !seenJobIds.has(job.id));
  if (fetchedJobs.length > 0) {
    const currentFetchJobIds = new Set(fetchedJobs.map(j => j.id).filter(id => id != null));
    await new Promise(resolve => chrome.storage.local.set({ seenJobIds: Array.from(currentFetchJobIds) }, resolve));
  }

  if (trulyNewJobs.length > 0) {
    console.log(`MV2 DirectBG: Found ${trulyNewJobs.length} truly new jobs.`);
    trulyNewJobs.forEach(job => sendNotification(job));
  } else {
    console.log("MV2 DirectBG: No new jobs found after deduplication.");
  }
  await new Promise(resolve => chrome.storage.local.set({
    monitorStatus: `Checked DirectBG. New: ${trulyNewJobs.length}`,
    newJobsInLastRun: trulyNewJobs.length,
    lastCheckTimestamp: Date.now()
  }, resolve));
  if (trulyNewJobs.length > 0) console.log("MV2 DirectBG: Sample new job:", trulyNewJobs[0]);
}

// ... (onInstalled, Alarms, Notifications, onMessage listeners remain the same as your last fully working MV2 version)
// --- Initial setup on extension installation ---
chrome.runtime.onInstalled.addListener((details) => {
  console.log("MV2: Extension installed or updated:", details.reason);
  chrome.storage.local.set({
    monitorStatus: "Initializing...", lastCheckTimestamp: null, newJobsInLastRun: 0, seenJobIds: []
  }, () => {
    if (chrome.runtime.lastError) console.error("Error setting initial storage:", chrome.runtime.lastError);
    console.log("MV2: Initial storage set.");
    setupAlarms();
  });
});
// --- Alarms ---
const FETCH_ALARM_NAME = "fetchUpworkJobsAlarm_MV2";
function setupAlarms() {
  chrome.alarms.get(FETCH_ALARM_NAME, (alarm) => {
    if (!alarm) {
      console.log("MV2: Creating fetch alarm.");
      chrome.alarms.create(FETCH_ALARM_NAME, { delayInMinutes: 1, periodInMinutes: 7 });
    } else { console.log("MV2: Fetch alarm already exists."); }
  });
}
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === FETCH_ALARM_NAME) {
    console.log("MV2: Alarm triggered:", alarm.name);
    await runJobCheck();
  }
});
// --- Notifications ---
function sendNotification(job) {
  const jobUrl = `https://www.upwork.com/jobs/${job.ciphertext || job.id}`;
  const notificationOptions = {
    type: "basic", iconUrl: "icons/icon48.png", title: "New Upwork Job!",
    message: `${job.title}\nBudget: ${(job.budget && job.budget.amount) ? job.budget.amount + ' ' + (job.budget.currencyCode || '') : 'N/A'}`,
    priority: 2
  };
  chrome.notifications.create(jobUrl, notificationOptions, (notificationId) => {
    if (chrome.runtime.lastError) console.error("Notification error:", chrome.runtime.lastError);
    // else console.log("Notification shown:", notificationId); // Can be noisy
  });
}
chrome.notifications.onClicked.addListener((notificationId) => {
  chrome.tabs.create({ url: notificationId });
  chrome.notifications.clear(notificationId);
});
// --- Message listener for popup ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "manualCheck") {
    console.log("MV2: Received manualCheck request from popup.");
    runJobCheck().then(() => sendResponse({ status: "Manual check initiated." }))
                 .catch(() => sendResponse({ status: "Manual check failed to initiate." }));
    return true;
  }
});
setupAlarms(); // Ensure alarms are set up when script loads
// background.js (Manifest V2)
console.log("Background Script MV2 loaded - Content Script Method.");

const UPWORK_DOMAIN = "https://www.upwork.com";
const TOKEN_COOKIE_NAME = "oauth2_global_js_token";
// const UPWORK_GRAPHQL_ENDPOINT_BASE = "https://www.upwork.com/api/graphql/v1"; // Not directly used by BG anymore
const X_UPWORK_API_TENANT_ID = "424307183201796097"; // Your Tenant ID

// At the top of background.js
const PREFERRED_TOKEN_COOKIE_NAME = "643e8096sb";
const FALLBACK_TOKEN_COOKIE_NAME = "oauth2_global_js_token";


async function getUpworkApiToken() {
  return new Promise(async (resolve) => {
    let token = null;
    // Try preferred cookie first
    let cookie = await new Promise(r => chrome.cookies.get({ url: UPWORK_DOMAIN, name: PREFERRED_TOKEN_COOKIE_NAME }, c => r(c))); // Fetches "643e8096sb"
    if (cookie && cookie.value) {
      console.log(`Bearer token found from PREFERRED cookie (${PREFERRED_TOKEN_COOKIE_NAME}):`, cookie.value.substring(0, 20) + "...");
      token = cookie.value;
    } else {
      // ... fallback logic ...
    }
    // ...
    resolve(token);
  });
}


/**
 * Retrieves the Upwork bearer token from cookies.
 */
async function getBearerToken() {
  return new Promise((resolve) => {
    chrome.cookies.get({ url: UPWORK_DOMAIN, name: TOKEN_COOKIE_NAME }, (cookie) => {
      if (chrome.runtime.lastError) {
        console.error("Error retrieving bearer token:", chrome.runtime.lastError.message);
        chrome.storage.local.set({ monitorStatus: "Error: Failed to access cookies." });
        resolve(null);
        return;
      }
      if (cookie && cookie.value) {
        console.log("Bearer token found:", cookie.value.substring(0, 20) + "...");
        resolve(cookie.value);
      } else {
        console.warn("Upwork bearer token cookie not found. User might not be logged in.");
        chrome.storage.local.set({ monitorStatus: "Error: Token not found. Log in to Upwork." });
        resolve(null);
      }
    });
  });
}

/**
 * Fetches jobs by sending a message to an active Upwork content script.
 * @param {string} bearerToken The authentication token.
 * @returns {Promise<Array<Object>|null>} An array of mapped job objects or null on failure.
 */
async function fetchUpworkJobsViaContentScript(bearerToken) {
  console.log("Background: Attempting to fetch jobs via content script.");

  // This is the query + variables that worked in your browser
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
      userQuery: "core web vitals", // Or your desired search term
      contractorTier: ["IntermediateLevel", "ExpertLevel"],
      sort: "recency",
      highlight: false,
      paging: { offset: 0, count: 8 }, // How many jobs to fetch
    },
  };
  const graphqlPayload = { query: fullRawQueryString, variables: variables };

  return new Promise((resolve, reject) => {
    // Query for any Upwork tab, not necessarily active, to increase chances of finding one.
    // Content script must be injected into the page for sendMessage to work.
    chrome.tabs.query({ url: "*://*.upwork.com/*" }, (tabs) => {
      if (chrome.runtime.lastError) {
        console.error("Background: Error querying tabs:", chrome.runtime.lastError.message);
        reject(new Error("Failed to query tabs."));
        return;
      }

      if (tabs && tabs.length > 0) {
        // Send to the first available Upwork tab.
        // A more robust solution might try multiple tabs or wait for one.
        const targetTab = tabs[0];
        console.log("Background: Sending fetch request to content script in tab:", targetTab.id, "URL:", targetTab.url);

        chrome.tabs.sendMessage(
          targetTab.id,
          {
            action: "fetchJobsFromContentScript",
            payload: {
              token: bearerToken,
              graphqlPayload: graphqlPayload,
              tenantId: X_UPWORK_API_TENANT_ID
            }
          },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error("Background: Error sending message or no response from content script. Is an Upwork tab open with the content script injected?", chrome.runtime.lastError.message);
              reject(new Error("Communication error with content script: " + chrome.runtime.lastError.message + ". Ensure an Upwork page is open."));
              return;
            }

            if (response && response.success && response.data) {
              console.log("Background: Received successful data from content script.");
              if (response.data.errors) {
                 console.error("Background: GraphQL API returned errors (via content script):", response.data.errors);
                 reject(new Error("GraphQL API error (via content script): " + JSON.stringify(response.data.errors)));
              } else if (response.data.data && response.data.data.search && response.data.data.search.universalSearchNuxt && response.data.data.search.universalSearchNuxt.userJobSearchV1 && response.data.data.search.universalSearchNuxt.userJobSearchV1.results) {
                const jobsData = response.data.data.search.universalSearchNuxt.userJobSearchV1.results;
                const mappedJobs = jobsData.map(job => ({ // Your mapping logic
                  id: job.jobTile.job.ciphertext || job.jobTile.job.id,
                  ciphertext: job.jobTile.job.ciphertext,
                  original_id: job.id, // from the top level of the result item
                  title: job.title,
                  description: job.description,
                  postedOn: job.jobTile.job.publishTime || job.jobTile.job.createTime,
                  budget: {
                      amount: job.jobTile.job.fixedPriceAmount ? job.jobTile.job.fixedPriceAmount.amount : (job.jobTile.job.hourlyBudgetMin || job.jobTile.job.hourlyBudgetMax),
                      currencyCode: job.jobTile.job.fixedPriceAmount ? job.jobTile.job.fixedPriceAmount.isoCurrencyCode : 'USD', // Default or check hourly
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
                resolve(mappedJobs);
              } else {
                console.warn("Background: No jobs data in expected structure from content script:", response.data);
                resolve([]); // Resolve with empty array if structure is unexpected but no GraphQL error
              }
            } else {
              console.error("Background: Content script reported an error or invalid response:", response);
              reject(new Error(response && response.error ? response.error : "Content script failed or returned invalid response."));
            }
          }
        );
      } else {
        console.warn("Background: No Upwork tab found to send message to. Please open an Upwork page.");
        reject(new Error("No Upwork tab found. Open an Upwork page and try again."));
      }
    });
  });
}

// --- Test Function ---
async function testFetchJobs() { // This will now test the content script method
  console.log("MV2: Running testFetchJobs (via Content Script)...");
  await chrome.storage.local.set({ monitorStatus: "Testing content script fetch..." });

  //const token = await getBearerToken();
  const token = await getUpworkApiToken();
  if (!token) {
    console.error("MV2: Cannot test fetch jobs, token missing.");
    await chrome.storage.local.set({ monitorStatus: "Test failed: Token missing." });
    return;
  }

  try {
    const jobs = await fetchUpworkJobsViaContentScript(token); // Call the new function
    if (jobs) { // jobs will be an array, possibly empty
      console.log(`MV2 Test: Fetched ${jobs.length} jobs via content script.`);
      if (jobs.length > 0) {
        console.log("MV2 First job mapped details:", jobs[0]);
      }
      await chrome.storage.local.set({ monitorStatus: `Test: Fetched ${jobs.length} jobs.` });
    } else {
      // This case (jobs is null) should ideally be caught by the reject in fetchUpworkJobsViaContentScript
      console.error("MV2: Failed to fetch jobs in test (jobs array is null/undefined after content script call).");
      await chrome.storage.local.set({ monitorStatus: "Test failed: No jobs array." });
    }
  } catch (error) {
    console.error("MV2: Error during testFetchJobs (content script method):", error.message);
    await chrome.storage.local.set({ monitorStatus: `Test Error: ${error.message}` });
  }
}

// --- Initial setup on extension installation ---
chrome.runtime.onInstalled.addListener((details) => {
  console.log("MV2: Extension installed or updated:", details.reason);
  chrome.storage.local.set({
    monitorStatus: "Initializing...",
    lastCheckTimestamp: null,
    newJobsInLastRun: 0,
    seenJobIds: []
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
        } else {
            console.log("MV2: Fetch alarm already exists.");
        }
    });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === FETCH_ALARM_NAME) {
    console.log("MV2: Alarm triggered:", alarm.name);
    await runJobCheck();
  }
});

// --- Main job checking logic ---
async function runJobCheck() {
  console.log("MV2: Attempting to run job check (via Content Script)...");
  await new Promise(resolve => chrome.storage.local.set({ monitorStatus: "Checking for jobs...", lastCheckTimestamp: Date.now() }, resolve));

  //const token = await getBearerToken();
  const token = await getUpworkApiToken();
  if (!token) {
    console.error("MV2: Cannot run job check: No bearer token.");
    // Status already set by getBearerToken if it fails
    return;
  }

  let fetchedJobs = null;
  try {
    fetchedJobs = await fetchUpworkJobsViaContentScript(token);
  } catch (error) {
    console.error("MV2: Error in runJobCheck calling fetchUpworkJobsViaContentScript:", error.message);
    await new Promise(resolve => chrome.storage.local.set({ monitorStatus: "Error: " + error.message }, resolve));
    return;
  }

  if (fetchedJobs === null) { // Should be caught by the catch block above now
    console.error("MV2: Job check failed: Could not fetch jobs (fetch function returned null).");
    // If error wasn't set by the fetch function, set a generic one
    await new Promise(resolve => chrome.storage.local.set({ monitorStatus: "Error: Job fetch returned null." }, resolve));
    return;
  }

  // Deduplication (placeholder)
  // const seenJobIds = await new Promise(resolve => chrome.storage.local.get(['seenJobIds'], result => resolve(new Set(result.seenJobIds || []))));
  // const newJobs = fetchedJobs.filter(job => !seenJobIds.has(job.id));
  // const allFetchedIdsForThisRun = new Set(fetchedJobs.map(j => j.id));
  // await new Promise(resolve => chrome.storage.local.set({ seenJobIds: Array.from(new Set([...seenJobIds, ...allFetchedIdsForThisRun])) }, resolve));
  const newJobs = fetchedJobs; // For now, all are new

  if (newJobs.length > 0) {
    console.log(`MV2: Found ${newJobs.length} new jobs.`);
    newJobs.forEach(job => sendNotification(job));
  } else {
    console.log("MV2: No new jobs found in this run.");
  }

  await new Promise(resolve => chrome.storage.local.set({
    monitorStatus: `Checked. New jobs: ${newJobs.length}`,
    newJobsInLastRun: newJobs.length,
    lastCheckTimestamp: Date.now()
  }, resolve));

  if (newJobs.length > 0) {
    console.log("MV2: Sample new job data (first one):", newJobs[0]);
  }
}

// --- Notifications ---
function sendNotification(job) {
    const jobUrl = `https://www.upwork.com/jobs/${job.ciphertext || job.id}`;
    const notificationOptions = {
        type: "basic",
        iconUrl: "icons/icon48.png",
        title: "New Upwork Job!",
        message: `${job.title}\nBudget: ${(job.budget && job.budget.amount) ? job.budget.amount + ' ' + (job.budget.currencyCode || '') : 'N/A'}`,
        priority: 2
    };
    chrome.notifications.create(jobUrl, notificationOptions, (notificationId) => {
        if (chrome.runtime.lastError) console.error("Notification error:", chrome.runtime.lastError);
        else console.log("Notification shown:", notificationId);
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
    runJobCheck().then(() => {
      sendResponse({ status: "Manual check initiated." }); // Let popup know it started
    }).catch(error => {
      // Error already logged by runJobCheck
      sendResponse({ status: "Manual check failed to initiate." });
    });
    return true; // Indicates async response
  }
});

// Call setupAlarms on script load
setupAlarms();
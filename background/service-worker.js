// background/service-worker.js
console.log("Service Worker V3 loaded.");

const UPWORK_DOMAIN = "https://www.upwork.com";
const TOKEN_COOKIE_NAME = "oauth2_global_js_token";

/**
 * Retrieves the Upwork bearer token from cookies.
 * @returns {Promise<string|null>} The bearer token string or null if not found.
 */
async function getBearerToken() {
  try {
    const cookie = await chrome.cookies.get({
      url: UPWORK_DOMAIN,
      name: TOKEN_COOKIE_NAME,
    });

    if (cookie && cookie.value) {
      console.log("Bearer token found:", cookie.value.substring(0, 20) + "..."); // Log a snippet for privacy
      return cookie.value;
    } else {
      console.warn("Upwork bearer token cookie not found. User might not be logged in.");
      await chrome.storage.local.set({ monitorStatus: "Error: Token not found. Please log in to Upwork." });
      return null;
    }
  } catch (error) {
    console.error("Error retrieving bearer token:", error);
    await chrome.storage.local.set({ monitorStatus: "Error: Failed to access cookies." });
    return null;
  }
}

// --- Test function (you can call this from the service worker console) ---
async function testGetToken() {
  const token = await getBearerToken();
  if (token) {
    console.log("Test successful: Token retrieved.");
  } else {
    console.error("Test failed: Token not retrieved.");
  }
}
// To test manually:
// 1. Make sure you are logged into upwork.com in your browser.
// 2. Go to chrome://extensions
// 3. Find your "Upwork Job Monitor" extension.
// 4. Click the "Service worker" link. This opens the DevTools for the service worker.
// 5. In the console of that DevTools, type: await testGetToken() and press Enter.
// You should see the log messages from getBearerToken.

// --- Initial setup on extension installation ---
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("Extension installed or updated:", details.reason);
  // Initialize some default status in storage
  await chrome.storage.local.set({
    monitorStatus: "Initializing...",
    lastCheckTimestamp: null,
    newJobsInLastRun: 0,
    seenJobIds: [] // Initialize as an empty array
  });

  // We'll set up alarms here later
  console.log("Alarm setup will be added here.");
});

// --- Message listener for manual check from popup ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "manualCheck") {
    console.log("Received manualCheck request from popup.");
    // We will call the main job checking function here later
    // For now, let's just test token retrieval
    (async () => {
      const token = await getBearerToken();
      if (token) {
        await chrome.storage.local.set({ monitorStatus: "Manual check: Token OK" });
        sendResponse({ status: "Token check initiated.", tokenFound: true });
      } else {
        await chrome.storage.local.set({ monitorStatus: "Manual check: Token NOT found" });
        sendResponse({ status: "Token check initiated.", tokenFound: false });
      }
      // Notify popup to update its display
      chrome.runtime.sendMessage({ action: "updatePopup" }).catch(e => console.log("Popup not open or error sending message:", e));

    })();
    return true; // Indicates that the response will be sent asynchronously
  }
});

// --- Placeholder for where the main job checking logic will go ---
async function runJobCheck() {
  console.log("Attempting to run job check...");
  const token = await getBearerToken();
  if (!token) {
    console.error("Cannot run job check: No bearer token.");
    await chrome.storage.local.set({ monitorStatus: "Error: Token missing for job check." });
    chrome.runtime.sendMessage({ action: "updatePopup" }).catch(e => console.log("Popup not open or error sending message:", e));
    return;
  }
  // TODO: Fetch jobs from Upwork API using the token
  console.log("Token available, proceeding to fetch jobs (not implemented yet).");
  await chrome.storage.local.set({ monitorStatus: "Fetching jobs...", lastCheckTimestamp: Date.now() });
  chrome.runtime.sendMessage({ action: "updatePopup" }).catch(e => console.log("Popup not open or error sending message:", e));

  // Simulate finding jobs for now
  // const fetchedJobs = []; // Replace with actual API call
  // const newJobs = []; // Replace with deduplication logic

  // Update status
  // await chrome.storage.local.set({
  //   monitorStatus: `Checked. New jobs: ${newJobs.length}`,
  //   newJobsInLastRun: newJobs.length,
  //   lastCheckTimestamp: Date.now()
  // });
  // chrome.runtime.sendMessage({ action: "updatePopup" }).catch(e => console.log("Popup not open or error sending message:", e));

}

// ----- END OF service-worker.js -----
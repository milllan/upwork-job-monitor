console.log("Popup script loaded.");

document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('status');
  const lastCheckTimeEl = document.getElementById('lastCheckTime');
  const newJobsCountEl = document.getElementById('newJobsCount');
  const manualCheckButton = document.getElementById('manualCheckButton');

  // Placeholder function to update popup - we'll fetch real data from storage later
  function updatePopupInfo() {
    chrome.storage.local.get(['monitorStatus', 'lastCheckTimestamp', 'newJobsInLastRun'], (result) => {
      statusEl.textContent = result.monitorStatus || 'Idle';
      if (result.lastCheckTimestamp) {
        lastCheckTimeEl.textContent = new Date(result.lastCheckTimestamp).toLocaleString();
      } else {
        lastCheckTimeEl.textContent = 'N/A';
      }
      newJobsCountEl.textContent = result.newJobsInLastRun !== undefined ? result.newJobsInLastRun : 'N/A';
    });
  }

  if (manualCheckButton) {
    manualCheckButton.addEventListener('click', () => {
      console.log("Manual check requested from popup.");
      statusEl.textContent = 'Checking...';
      // Send a message to the service worker to trigger a check
      chrome.runtime.sendMessage({ action: "manualCheck" }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error sending manual check message:", chrome.runtime.lastError.message);
          statusEl.textContent = 'Error triggering check';
        } else {
          console.log("Manual check message sent, response:", response);
          // The service worker will update storage, then we can re-fetch
          setTimeout(updatePopupInfo, 1000); // Give a moment for SW to process
        }
      });
    });
  }

  // Update popup when it's opened
  updatePopupInfo();

  // Listen for updates from the service worker (optional, more advanced)
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updatePopup") {
      updatePopupInfo();
    }
  });
});
console.log("Popup script loaded.");

// popup/popup.js - ensure DOMContentLoaded and storage access are robust

document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('status');
  const lastCheckTimeEl = document.getElementById('lastCheckTime');
  const newJobsCountEl = document.getElementById('newJobsCount');
  const manualCheckButton = document.getElementById('manualCheckButton');

  function updatePopupInfo() {
    chrome.storage.local.get(['monitorStatus', 'lastCheckTimestamp', 'newJobsInLastRun'], (result) => {
      if (chrome.runtime.lastError) {
        console.error("Popup: Error getting storage:", chrome.runtime.lastError.message);
        statusEl.textContent = 'Error loading status';
        return;
      }
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
      console.log("Popup: Manual check requested.");
      statusEl.textContent = 'Checking...';
      chrome.runtime.sendMessage({ action: "manualCheck" }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("Popup: Error sending manual check message:", chrome.runtime.lastError.message);
          statusEl.textContent = 'Error triggering check';
        } else {
          console.log("Popup: Manual check message sent, response:", response);
          // Background script will update storage, an alarm will eventually run,
          // or just re-fetch info after a short delay for immediate feedback.
          setTimeout(updatePopupInfo, 1500); // Give time for background to process and update storage
        }
      });
    });
  }

  updatePopupInfo(); // Initial update
});
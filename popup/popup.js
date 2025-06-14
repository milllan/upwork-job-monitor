// popup.js
document.addEventListener('DOMContentLoaded', () => {
  // Assuming StorageManager is loaded via popup.html
  const popupTitleLinkEl = document.getElementById('popupTitleLink'); // Link for the main title
  const consolidatedStatusEl = document.getElementById('consolidatedStatus');
  const manualCheckButton = document.getElementById('manualCheckButton');
  const userQueryInput = document.getElementById('userQueryInput');
  const saveQueryButton = document.getElementById('saveQueryButton');
  const recentJobsListDiv = document.getElementById('recentJobsList');

  // This DEFAULT_QUERY is used if no query is in storage.
  // For the link to match the service-worker's DEFAULT_USER_QUERY initially (if no user query is set),
  // ensure this string is identical to DEFAULT_USER_QUERY in service-worker.js.
  // Use config.DEFAULT_USER_QUERY as the fallback if storage is empty
  // config object is expected to be globally available from config.js (loaded in popup.html)
  const POPUP_DEFAULT_CONTRACTOR_TIERS_GQL = ["IntermediateLevel", "ExpertLevel"]; // Matches service worker
  const POPUP_DEFAULT_SORT_CRITERIA = "recency"; // Matches service worker
  let collapsedJobIds = new Set(); // In-memory store for collapsed job IDs, loaded from storage (via StorageManager)
  let deletedJobIds = new Set(); // In-memory store for explicitly deleted job IDs (via StorageManager)

  function saveCollapsedState() {
    StorageManager.setCollapsedJobIds(Array.from(collapsedJobIds));
  }

  async function saveDeletedState() {
    await StorageManager.addDeletedJobIds(Array.from(deletedJobIds)); // StorageManager handles the limit
    // Update UI immediately for deleted count
    updateConsolidatedStatusDisplay({ deletedJobsCount: deletedJobIds.size });
  }

  function updatePopupTitleLink(currentQuery) {
    if (popupTitleLinkEl) {
      const url = constructUpworkSearchURL(
        currentQuery,
        POPUP_DEFAULT_CONTRACTOR_TIERS_GQL,
        POPUP_DEFAULT_SORT_CRITERIA
      );
      popupTitleLinkEl.href = url;
    }
  }

  function updateConsolidatedStatusDisplay(data = {}) {
    if (!consolidatedStatusEl) return;

    // Preserve existing values if not provided in data, to allow partial updates
    const currentStatusText = consolidatedStatusEl.querySelector('span[title^="Current monitor status"]')?.textContent || 'Idle';
    const currentLastCheckText = consolidatedStatusEl.querySelector('span[title^="Last successful check time"]')?.textContent.replace('Last: ','') || 'N/A';
    const currentDeletedText = consolidatedStatusEl.querySelector('span[title^="Jobs you\'ve deleted"]')?.textContent.replace('Del: ','') || deletedJobIds.size.toString();

    const statusText = data.monitorStatusText !== undefined ? data.monitorStatusText : currentStatusText; // Use provided status or current
    
    let lastCheckDisplay = currentLastCheckText;
    if (data.lastCheckTimestamp !== undefined) {
      if (data.lastCheckTimestamp) {
        const lastCheckDate = new Date(data.lastCheckTimestamp);
        const timeString = lastCheckDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        lastCheckDisplay = `${timeString} (${timeAgo(lastCheckDate)})`;
      } else {
        lastCheckDisplay = 'N/A';
      }
    }
    const deletedCount = data.deletedJobsCount !== undefined ? data.deletedJobsCount : parseInt(currentDeletedText, 10) || 0; // Use provided count or current

    consolidatedStatusEl.innerHTML =
      `<span title="Current monitor status">${statusText}</span> | ` +
      `<span title="Last successful check time">Last: ${lastCheckDisplay}</span> | ` +
      `<span title="Jobs you've deleted from the list">Del: ${deletedCount}</span>`;
  }

  function createJobItemHTML(job, isInitiallyCollapsed) {
    const jobUrl = `https://www.upwork.com/jobs/${job.ciphertext || job.id}`;
    let budgetDisplay = 'N/A';
    if (job.budget && job.budget.amount != null) {
      budgetDisplay = `${job.budget.amount} ${job.budget.currencyCode || ''}`;
      if (job.budget.type && job.budget.type.toLowerCase() !== 'fixed') {
        budgetDisplay += ` (${job.budget.type.toLowerCase().replace('_', '-')})`;
      }
    }

    let clientInfo = 'Client info N/A';
    let clientClasses = [];
    if (job.client) {
      clientInfo = `Client: ${job.client.country || 'N/A'}`;
      if (job.client.rating != null) {
        const rating = parseFloat(job.client.rating);
        clientInfo += ` | Rating: ${rating.toFixed(2)}`;
        if (rating > 4.9) clientClasses.push('high-rating');
      }
      if (job.client.totalSpent > 0) clientInfo += ` | Spent: $${Number(job.client.totalSpent).toFixed(0)}`;
      if (job.client.paymentVerificationStatus !== 'VERIFIED') {
        clientInfo += ' <span class="unverified-icon" title="Client payment not verified">⚠️</span>';
      }
    }

    let skillsDisplay = '';
    if (job.skills && job.skills.length > 0) {
      skillsDisplay = `Skills: ${job.skills.map(s => s.name).slice(0, 3).join(', ')}${job.skills.length > 3 ? '...' : ''}`;
    }

    const appliedIconHTML = job.applied ? `
      <span class="applied-job-icon" title="You applied to this job">
        <img src="icons/applied-icon.svg" alt="Applied to job" class="air3-icon sm" data-test="UpCIcon" />
      </span>` : '';

    let titlePrefix = '';
    if (job.isExcludedByTitleFilter) { // Highest precedence for the tag
      titlePrefix = '<span class="low-priority-prefix">Filtered</span> ';
    } else if (job.isLowPriorityByClientCountry && job.client && job.client.country) {
      // Capitalize the first letter of the country for display
      const countryName = job.client.country.charAt(0).toUpperCase() + job.client.country.slice(1).toLowerCase();
      titlePrefix = `<span class="low-priority-prefix">${countryName}</span> `;
    } else if (job.isLowPriorityBySkill) {
      titlePrefix = '<span class="low-priority-prefix">Skill</span> ';
    }

    const isLowPriority = job.isLowPriorityBySkill || job.isLowPriorityByClientCountry;
    let jobItemClasses = 'job-item';
    if (isLowPriority) {
      jobItemClasses += ' low-priority';
    }
    if (job.isExcludedByTitleFilter) {
      jobItemClasses += ' excluded-by-filter';
    }
    if (job.applied) {
      jobItemClasses += ' job-applied';
    }
    if (clientClasses.length > 0) {
      jobItemClasses += ' ' + clientClasses.join(' ');
    }

    return `
      <div class="${jobItemClasses}" data-job-id="${job.id}">
        <div class="job-header ${isInitiallyCollapsed ? 'job-title-collapsed' : ''}">
          <span class="toggle-details" data-job-id="${job.id}">${isInitiallyCollapsed ? '+' : '-'}</span>
          <h3>
            ${titlePrefix}<a href="${jobUrl}" target="_blank" title="${job.title || 'No Title'}">${job.title || 'No Title'}</a>
            ${appliedIconHTML}
          </h3>
          <span class="delete-job-button" data-job-id="${job.id}" title="Remove from list">×</span>
        </div>
        <div class="job-details" style="display: ${isInitiallyCollapsed ? 'none' : 'block'};">
          <p><strong>Budget:</strong> ${budgetDisplay}</p>
          <p>${clientInfo}</p>
          ${skillsDisplay ? `<p class="skills">${skillsDisplay}</p>` : ''}
          <p><small>Posted: ${job.postedOn ? new Date(job.postedOn).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) + ', ' + new Date(job.postedOn).toLocaleDateString() : 'N/A'} <b>(${timeAgo(job.postedOn)})</b></small></p>
        </div>
      </div>
    `;
  }

  function displayRecentJobs(jobs = []) {
    console.log("Popup: displayRecentJobs called with:", jobs);
    recentJobsListDiv.innerHTML = '';

    if (!Array.isArray(jobs) || jobs.length === 0) {
      console.log("Popup: No valid jobs array to display or jobs array is empty.");
      recentJobsListDiv.innerHTML = '<p class="no-jobs">No new jobs found in the last check.</p>';
      recentJobsListDiv.classList.add('empty-list');
      return;
    }

    // Filter out jobs that have been explicitly deleted
    const jobsToDisplay = jobs.filter(job => job && job.id && !deletedJobIds.has(job.id));

    if (jobsToDisplay.length === 0) {
      console.log("Popup: No jobs to display after filtering deleted items.");
      recentJobsListDiv.innerHTML = '<p class="no-jobs">No new jobs found (all previously seen or deleted).</p>';
      recentJobsListDiv.classList.add('empty-list');
    } else {
      console.log(`Popup: Displaying ${jobsToDisplay.length} jobs (filtered from ${jobs.length} total recent).`);
      jobsToDisplay.forEach((job, index) => {
        if (!job || !job.id) {
          console.warn(`Popup: Skipping job at index ${index} due to missing job or job.id`, job);
          return;
        }

        const isInitiallyCollapsed = job.isExcludedByTitleFilter || collapsedJobIds.has(job.id);
        const jobItemHTML = createJobItemHTML(job, isInitiallyCollapsed);
        recentJobsListDiv.insertAdjacentHTML('beforeend', jobItemHTML);
      });
      recentJobsListDiv.classList.remove('empty-list');
    }
  }

  // Refactored loadStoredData to use StorageManager
  async function loadStoredData() {
    console.log("Popup: loadStoredData called.");
    try {
      const [monitorStatus, lastCheckTimestamp, currentUserQuery, recentFoundJobs, loadedCollapsedIds, loadedDeletedIds] = await Promise.all([
        StorageManager.getMonitorStatus(),
        StorageManager.getLastCheckTimestamp(),
        StorageManager.getCurrentUserQuery(),
        StorageManager.getRecentFoundJobs(),
        StorageManager.getCollapsedJobIds(),
        StorageManager.getDeletedJobIds()
      ]);

      const currentQuery = currentUserQuery || config.DEFAULT_USER_QUERY; // Use config default if storage is empty
      userQueryInput.value = currentQuery; // Set input value
      deletedJobIds = loadedDeletedIds; // Update in-memory sets
      collapsedJobIds = loadedCollapsedIds;

      // Update UI elements
      updateConsolidatedStatusDisplay({ monitorStatusText: monitorStatus, lastCheckTimestamp: lastCheckTimestamp, deletedJobsCount: deletedJobIds.size });
      updatePopupTitleLink(currentQuery); // Update title link

      displayRecentJobs(recentFoundJobs); // Display jobs

    } catch (error) {
      console.error("Popup: Error in loadStoredData Promise.all:", error, error.stack ? error.stack : '(no stack trace)');
      updateConsolidatedStatusDisplay({ monitorStatusText: 'Error loading status' });
      recentJobsListDiv.innerHTML = '<p class="no-jobs">Error loading job data.</p>';
    }
  }

  function triggerCheck(queryToUse) {
    updateConsolidatedStatusDisplay({ monitorStatusText: 'Checking...' });
    console.log("Popup: Triggering check with query:", queryToUse);

    chrome.runtime.sendMessage({ action: "manualCheck", userQuery: queryToUse }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Popup: Error sending manual check message:", chrome.runtime.lastError.message);
        // Rely on updatePopupDisplay message or next loadStoredData to update status from storage
        loadStoredData(); // Attempt to refresh with current state on error
      } else {
        console.log("Popup: Manual check message sent, background responded:", response);
        // Background will now send "updatePopupDisplay" when it's truly done.
        // We can reflect the immediate response from background here if needed.
        // if (response && response.status) statusEl.textContent = response.status;
      }
    });
  }

  saveQueryButton.addEventListener('click', () => {
    const query = userQueryInput.value.trim();
    if (query) { // Use StorageManager
      StorageManager.setCurrentUserQuery(query).then(() => {
        updatePopupTitleLink(query); // Update title link
        console.log("Popup: Query saved:", query);
        triggerCheck(query);
      });
    } else { // Handle empty query case
      alert("Please enter a search query.");
      userQueryInput.value = config.DEFAULT_USER_QUERY; // Use centralized default
    }
  });
// Add Enter key support for search input
  userQueryInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      saveQueryButton.click(); // Trigger save & check
    }
  });

  manualCheckButton.addEventListener('click', () => {
    const currentQueryInInput = userQueryInput.value.trim(); // Use config default if input is empty
    const queryToUse = currentQueryInInput || config.DEFAULT_USER_QUERY; // Use centralized default
    updatePopupTitleLink(queryToUse); // Update title link
    triggerCheck(queryToUse);
  });

  // Listen for messages from background script to update the display
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updatePopupDisplay") {
      console.log("Popup: Received updatePopupDisplay message from background. Refreshing data.");
      loadStoredData();
      if (sendResponse) sendResponse({ status: "Popup display refreshed."});
      return true; 
    }
  });

  // Add a listener for storage changes to keep the popup data up-to-date
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      console.log("Popup: Storage changed, reloading data. Changes:", changes);
      // Check if relevant keys have changed before reloading to avoid unnecessary reloads
      const relevantKeys = ['monitorStatus', 'lastCheckTimestamp', 'recentFoundJobs', 'collapsedJobIds', 'deletedJobIds', 'currentUserQuery'];
      const hasRelevantChange = Object.keys(changes).some(key => relevantKeys.includes(key) || Object.values(StorageManager.STORAGE_KEYS).includes(key));
      if (hasRelevantChange) {
        loadStoredData();
      }
    }
  });

  // Event delegation for job items
  recentJobsListDiv.addEventListener('click', (event) => {
    const toggleButton = event.target.closest('.toggle-details');
    const deleteButton = event.target.closest('.delete-job-button');
    const jobItemElement = event.target.closest('.job-item');

    if (!jobItemElement) return;
    const jobId = jobItemElement.dataset.jobId;

    if (toggleButton && jobId) {
      event.stopPropagation();
      const jobDetailsContainer = jobItemElement.querySelector('.job-details');
      const jobHeader = jobItemElement.querySelector('.job-header');
      if (!jobDetailsContainer || !jobHeader) return;

      const isCurrentlyCollapsed = jobDetailsContainer.style.display === 'none';
      if (isCurrentlyCollapsed) {
        jobDetailsContainer.style.display = 'block';
        toggleButton.textContent = '-';
        jobHeader.classList.remove('job-title-collapsed');
        collapsedJobIds.delete(jobId);
      } else {
        jobDetailsContainer.style.display = 'none';
        toggleButton.textContent = '+';
        jobHeader.classList.add('job-title-collapsed');
        collapsedJobIds.add(jobId);
      }
      saveCollapsedState();
    } else if (deleteButton && jobId) {
      event.stopPropagation();
      console.log(`Popup: Deleting job ID: ${jobId}`);
      jobItemElement.remove();
      deletedJobIds.add(jobId);
      saveDeletedState();

      StorageManager.getRecentFoundJobs().then(currentRecentJobs => {
        StorageManager.setRecentFoundJobs(currentRecentJobs.filter(item => item.id !== jobId));
      });
    }
  });

  // Add this line to see if this is happening
  console.log("Popup: Added storage listener.");

  loadStoredData(); // Initial load
});
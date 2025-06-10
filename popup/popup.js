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
  // TODO: Get this default query from storage manager or config if possible
  const DEFAULT_QUERY = 'NOT "react" NOT "next.js" NOT "wix" NOT "HubSpot" NOT "Squarespace" NOT "Webflow Website" NOT "Webflow Page" NOT "Content Marketing" NOT "Guest Post" "CLS" OR "INP" OR "LCP" OR "pagespeed" OR "Page speed" OR "Shopify speed" OR "Wordpress speed" OR "site speed" OR "web vitals" OR "WebPageTest" OR "GTmetrix" OR "Lighthouse scores" OR "Google Lighthouse" OR "page load" OR "performance expert" OR "performance specialist" OR "performance audit"';
  const POPUP_DEFAULT_CONTRACTOR_TIERS_GQL = ["IntermediateLevel", "ExpertLevel"]; // Matches service worker
  const POPUP_DEFAULT_SORT_CRITERIA = "recency"; // Matches service worker
  let collapsedJobIds = new Set(); // In-memory store for collapsed job IDs, loaded from storage
  let deletedJobIds = new Set(); // In-memory store for explicitly deleted job IDs

  function timeAgo(dateInput) {
    if (!dateInput) return 'N/A';
    const date = (typeof dateInput === 'string' || typeof dateInput === 'number') ? new Date(dateInput) : dateInput;
    if (isNaN(date.getTime())) return 'Invalid Date';

    const now = new Date();
    const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
    const minutes = Math.round(seconds / 60);
    const hours = Math.round(minutes / 60);
    const days = Math.round(hours / 24);

    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds} sec ago`;
    if (minutes < 60) return `${minutes} min ago`;
    if (hours < 24) return `${hours} hr ago`;
    if (days === 1) return `1 day ago`;
    return `${days} days ago`;
  }

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

    const statusText = data.monitorStatusText !== undefined ? data.monitorStatusText : currentStatusText;
    
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
    const deletedCount = data.deletedJobsCount !== undefined ? data.deletedJobsCount : parseInt(currentDeletedText, 10) || 0;

    consolidatedStatusEl.innerHTML =
      `<span title="Current monitor status">${statusText}</span> | ` +
      `<span title="Last successful check time">Last: ${lastCheckDisplay}</span> | ` +
      `<span title="Jobs you've deleted from the list">Del: ${deletedCount}</span>`;
  }

  function displayRecentJobs(jobs = []) {
    console.log("Popup: displayRecentJobs called with:", jobs);
    recentJobsListDiv.innerHTML = '';

    if (!Array.isArray(jobs) || jobs.length === 0) {
      console.log("Popup: No valid jobs array to display or jobs array is empty.");
      recentJobsListDiv.innerHTML = '<p class="no-jobs">No new jobs found in the last check.</p>';
      return;
    }

    // Filter out jobs that have been explicitly deleted
    const jobsToDisplay = jobs.filter(job => job && job.id && !deletedJobIds.has(job.id));

    console.log(`Popup: Displaying ${jobsToDisplay.length} jobs (filtered from ${jobs.length} total recent).`);
    jobsToDisplay.forEach((job, index) => {
      if (!job || !job.id) {
        console.warn(`Popup: Skipping job at index ${index} due to missing job or job.id`, job);
        return;
      }

      const jobItem = document.createElement('div');
      jobItem.classList.add('job-item');
      if (job.isExcludedByTitleFilter) {
        jobItem.classList.add('excluded-by-filter');
      }

      const isInitiallyCollapsed = job.isExcludedByTitleFilter || collapsedJobIds.has(job.id);

      const jobHeader = document.createElement('div');
      jobHeader.classList.add('job-header');

      const toggleButton = document.createElement('span');
      toggleButton.classList.add('toggle-details');
      toggleButton.textContent = isInitiallyCollapsed ? '+' : '-';

      const jobTitleEl = document.createElement('h3');
      const jobUrl = `https://www.upwork.com/jobs/${job.ciphertext || job.id}`;
      jobTitleEl.innerHTML = `<a href="${jobUrl}" target="_blank" title="${job.title || 'No Title'}" class="job-title-truncate-ellipsis">${(job.title || 'No Title').substring(0,59)}${(job.title || '').length > 55 ? '...' : ''}</a>`; // Shortened title slightly
      
      const deleteButton = document.createElement('span');
      deleteButton.classList.add('delete-job-button');
      deleteButton.textContent = '×'; // '×' is a common multiplication sign used for close/delete
      deleteButton.title = 'Remove from list';

      if (isInitiallyCollapsed) {
        jobHeader.classList.add('job-title-collapsed');
      }

      let budgetDisplay = 'N/A';
      if (job.budget && job.budget.amount != null) {
        budgetDisplay = `${job.budget.amount} ${job.budget.currencyCode || ''}`;
        if (job.budget.type && job.budget.type.toLowerCase() !== 'fixed') {
          budgetDisplay += ` (${job.budget.type.toLowerCase().replace('_', '-')})`;
        }
      }
      let clientInfo = 'Client info N/A';
      let isHighRating = false;
      if(job.client) {
        clientInfo = `Client: ${job.client.country || 'N/A'}`;
        if(job.client.rating != null) {
          const rating = parseFloat(job.client.rating);
          clientInfo += ` | Rating: ${rating.toFixed(2)}`;
          if (rating > 4.9) {
            isHighRating = true;
            jobHeader.classList.add('high-rating');
          }
        }
        if(job.client.totalSpent > 0) clientInfo += ` | Spent: $${Number(job.client.totalSpent).toFixed(0)}`;
        if (job.client.paymentVerificationStatus !== 'VERIFIED') {
          clientInfo += ' <span class="unverified-icon" title="Client payment not verified">⚠️</span>';
        }
      }
      let skillsDisplay = '';
      if (job.skills && job.skills.length > 0) {
        skillsDisplay = `Skills: ${job.skills.map(s => s.name).slice(0, 3).join(', ')}${job.skills.length > 3 ? '...' : ''}`; // Show fewer skills
      }

      jobHeader.appendChild(toggleButton);
      jobHeader.appendChild(jobTitleEl);
      jobHeader.appendChild(deleteButton); // Add delete button to header

      const jobDetailsContainer = document.createElement('div');
      jobDetailsContainer.classList.add('job-details');
      jobDetailsContainer.style.display = isInitiallyCollapsed ? 'none' : 'block';

      jobDetailsContainer.innerHTML = `
        <p><strong>Budget:</strong> ${budgetDisplay}</p>
        <p>${clientInfo}</p>
        ${skillsDisplay ? `<p class="skills">${skillsDisplay}</p>` : ''}
        <p><small>Posted: ${job.postedOn ? new Date(job.postedOn).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) + ', ' + new Date(job.postedOn).toLocaleDateString() : 'N/A'} <b>(${timeAgo(job.postedOn)})</b></small></p>
      `;

      jobItem.appendChild(jobHeader);
      jobItem.appendChild(jobDetailsContainer);
      recentJobsListDiv.appendChild(jobItem);

      toggleButton.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent any parent click handlers if added later
        const isCurrentlyCollapsed = jobDetailsContainer.style.display === 'none';
        if (isCurrentlyCollapsed) {
          jobDetailsContainer.style.display = 'block';
          toggleButton.textContent = '-';
          jobHeader.classList.remove('job-title-collapsed');
          collapsedJobIds.delete(job.id);
        } else {
          jobDetailsContainer.style.display = 'none';
          toggleButton.textContent = '+';
          jobHeader.classList.add('job-title-collapsed');
          collapsedJobIds.add(job.id);
        }
        saveCollapsedState();
      });

      deleteButton.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent toggle or link clicks
        console.log(`Popup: Deleting job ID: ${job.id}`);
        
        // Remove the job item element from the DOM
        jobItem.remove();

        // Add job ID to the deleted list and save
        deletedJobIds.add(job.id);
        saveDeletedState();

        // Update recent jobs in storage via StorageManager (it will filter deleted)
        StorageManager.getRecentFoundJobs().then(currentRecentJobs => {
            StorageManager.setRecentFoundJobs(currentRecentJobs.filter(item => item.id !== job.id));
        });
      });
    });
  }

  function loadStoredData() {
    console.log("Popup: loadStoredData called.");
    // Use StorageManager to get all necessary data
    Promise.all([
      StorageManager.getMonitorStatus(),
      StorageManager.getLastCheckTimestamp(),
      StorageManager.getCurrentUserQuery(),
      StorageManager.getRecentFoundJobs(),
      StorageManager.getCollapsedJobIds(),
      StorageManager.getDeletedJobIds()
    ]).then(([monitorStatus, lastCheckTimestamp, currentUserQuery, recentFoundJobs, loadedCollapsedIds, loadedDeletedIds]) => {
        const currentQuery = currentUserQuery || DEFAULT_QUERY; // Use local default if storage is empty
        userQueryInput.value = currentQuery; // Set input value
        deletedJobIds = loadedDeletedIds; // Update in-memory sets
        collapsedJobIds = loadedCollapsedIds;

        // Update UI elements
        updateConsolidatedStatusDisplay({ monitorStatusText: monitorStatus, lastCheckTimestamp: lastCheckTimestamp, deletedJobsCount: deletedIds.size });
        updatePopupTitleLink(currentQuery); // Update title link

        displayRecentJobs(result.recentFoundJobs || []);
      }
    );
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

      const currentQuery = currentUserQuery || DEFAULT_QUERY; // Use local default if storage is empty
      userQueryInput.value = currentQuery; // Set input value
      deletedJobIds = loadedDeletedIds; // Update in-memory sets
      collapsedJobIds = loadedCollapsedIds;

      // Update UI elements
      updateConsolidatedStatusDisplay({ monitorStatusText: monitorStatus, lastCheckTimestamp: lastCheckTimestamp, deletedJobsCount: deletedJobIds.size });
      updatePopupTitleLink(currentQuery); // Update title link

      displayRecentJobs(recentFoundJobs); // Display jobs

    } catch (error) {
      console.error("Popup: Error loading storage data:", error);
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
      userQueryInput.value = DEFAULT_QUERY;
    }
  });
// Add Enter key support for search input
  userQueryInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      saveQueryButton.click(); // Trigger save & check
    }
  });

  manualCheckButton.addEventListener('click', () => {
    const currentQueryInInput = userQueryInput.value.trim();
    const queryToUse = currentQueryInInput || DEFAULT_QUERY;
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

  loadStoredData(); // Initial load
});
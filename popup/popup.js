// popup.js
document.addEventListener('DOMContentLoaded', () => {
  const consolidatedStatusEl = document.getElementById('consolidatedStatus');
  const manualCheckButton = document.getElementById('manualCheckButton');
  const userQueryInput = document.getElementById('userQueryInput');
  const saveQueryButton = document.getElementById('saveQueryButton');
  const recentJobsListDiv = document.getElementById('recentJobsList');

  const DEFAULT_QUERY = 'NOT "react" NOT "next.js" NOT "wix" "web vitals" OR "CLS" OR "INP" OR "LCP" OR "pagespeed" OR "Page speed" OR "Shopify speed" OR "Wordpress speed" OR "website speed"';
  
  let collapsedJobIds = new Set(); // In-memory store for collapsed job IDs
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
    chrome.storage.local.set({ collapsedJobIds: Array.from(collapsedJobIds) });
  }

  function saveDeletedState() {
    const MAX_DELETED_IDS = 200; // Keep the last 200 deleted IDs
    chrome.storage.local.set({ deletedJobIds: Array.from(deletedJobIds).slice(-MAX_DELETED_IDS) });
    // Update UI immediately for deleted count
    updateConsolidatedStatusDisplay({ deletedJobsCount: deletedJobIds.size });
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
      if(job.client) {
        clientInfo = `Client: ${job.client.country || 'N/A'}`;
        if(job.client.rating != null) clientInfo += ` | Rating: ${Number(job.client.rating).toFixed(2)}`;
        if(job.client.totalSpent > 0) clientInfo += ` | Spent: $${Number(job.client.totalSpent).toFixed(0)}`;
        if(job.client.paymentVerificationStatus === 'VERIFIED') clientInfo += ' (Verified)';
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

        // Optionally, also remove from recentFoundJobs in storage immediately
        // This isn't strictly necessary as the display is filtered, but keeps storage cleaner
        chrome.storage.local.get(['recentFoundJobs'], (result) => {
          const updatedRecentJobs = (result.recentFoundJobs || []).filter(item => item.id !== job.id);
          chrome.storage.local.set({
            recentFoundJobs: updatedRecentJobs
            // seenJobIds is handled by the background script
          });
        });
      });
    });
  }

  function loadStoredData() {
    console.log("Popup: loadStoredData called.");
    chrome.storage.local.get(
      ['monitorStatus', 'lastCheckTimestamp', 'newJobsInLastRun', 'currentUserQuery', 'recentFoundJobs', 'collapsedJobIds', 'deletedJobIds'],
      (result) => {
        if (chrome.runtime.lastError) {
          console.error("Popup: Error getting storage:", chrome.runtime.lastError.message);
          updateConsolidatedStatusDisplay({ monitorStatusText: 'Error loading status' });
          recentJobsListDiv.innerHTML = '<p class="no-jobs">Error loading job data.</p>';
          return;
        }
        userQueryInput.value = result.currentUserQuery || DEFAULT_QUERY;
        deletedJobIds = new Set(result.deletedJobIds || []); // Load deleted state
        collapsedJobIds = new Set(result.collapsedJobIds || []); // Load collapsed state
        
        updateConsolidatedStatusDisplay({
          monitorStatusText: result.monitorStatus || 'Idle', // This includes "New (notifiable): X"
          lastCheckTimestamp: result.lastCheckTimestamp,
          deletedJobsCount: deletedJobIds.size
        });

        displayRecentJobs(result.recentFoundJobs || []);
      }
    );
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
    if (query) {
      chrome.storage.local.set({ currentUserQuery: query }, () => {
        console.log("Popup: Query saved:", query);
        triggerCheck(query);
      });
    } else {
      alert("Please enter a search query.");
      userQueryInput.value = DEFAULT_QUERY;
    }
  });

  manualCheckButton.addEventListener('click', () => {
    const currentQueryInInput = userQueryInput.value.trim();
    triggerCheck(currentQueryInInput || DEFAULT_QUERY); // Use DEFAULT_QUERY defined in this file
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
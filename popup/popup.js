// popup.js
document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('status');
  const lastCheckTimeEl = document.getElementById('lastCheckTime');
  const newJobsCountEl = document.getElementById('newJobsCount');
  const manualCheckButton = document.getElementById('manualCheckButton');
  const userQueryInput = document.getElementById('userQueryInput');
  const saveQueryButton = document.getElementById('saveQueryButton');
  const recentJobsListDiv = document.getElementById('recentJobsList');

  const DEFAULT_QUERY = 'NOT "react" NOT "next.js" NOT "wix" "web vitals" OR "CLS" OR "INP" OR "LCP" OR "pagespeed" OR "Page speed" OR "Shopify speed" OR "Wordpress speed" OR "website speed"';
  
  let collapsedJobIds = new Set(); // In-memory store for collapsed job IDs

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

  function displayRecentJobs(jobs = []) {
    console.log("Popup: displayRecentJobs called with:", jobs);
    recentJobsListDiv.innerHTML = '';

    if (!Array.isArray(jobs) || jobs.length === 0) {
      console.log("Popup: No valid jobs array to display or jobs array is empty.");
      recentJobsListDiv.innerHTML = '<p class="no-jobs">No new jobs found in the last check.</p>';
      return;
    }

    console.log(`Popup: Displaying ${jobs.length} jobs.`);
    jobs.forEach((job, index) => {
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
          collapsedJobIds.delete(job.id);
        } else {
          jobDetailsContainer.style.display = 'none';
          toggleButton.textContent = '+';
          collapsedJobIds.add(job.id);
        }
        saveCollapsedState();
      });
    });
  }

  function loadStoredData() {
    console.log("Popup: loadStoredData called.");
    chrome.storage.local.get(
      ['monitorStatus', 'lastCheckTimestamp', 'newJobsInLastRun', 'currentUserQuery', 'recentFoundJobs', 'collapsedJobIds'],
      (result) => {
        if (chrome.runtime.lastError) {
          console.error("Popup: Error getting storage:", chrome.runtime.lastError.message);
          statusEl.textContent = 'Error loading status';
          recentJobsListDiv.innerHTML = '<p class="no-jobs">Error loading job data.</p>';
          return;
        }
        statusEl.textContent = result.monitorStatus || 'Idle';
        if (result.lastCheckTimestamp) {
          lastCheckTimeEl.textContent = new Date(result.lastCheckTimestamp).toLocaleString();
        } else {
          lastCheckTimeEl.textContent = 'N/A';
        }
        newJobsCountEl.textContent = result.newJobsInLastRun !== undefined ? result.newJobsInLastRun : 'N/A';
        userQueryInput.value = result.currentUserQuery || DEFAULT_QUERY;
        collapsedJobIds = new Set(result.collapsedJobIds || []); // Load collapsed state
        displayRecentJobs(result.recentFoundJobs || []);
      }
    );
  }

  function triggerCheck(queryToUse) {
    statusEl.textContent = 'Checking...';
    // Do not clear the list here; let it be updated by loadStoredData after the check completes.
    console.log("Popup: Triggering check with query:", queryToUse);

    chrome.runtime.sendMessage({ action: "manualCheck", userQuery: queryToUse }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Popup: Error sending manual check message:", chrome.runtime.lastError.message);
        statusEl.textContent = 'Error triggering check';
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
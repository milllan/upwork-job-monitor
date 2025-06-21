// popup.js
document.addEventListener('DOMContentLoaded', () => {
  // Assuming StorageManager is loaded via popup.html
  const popupTitleLinkEl = document.querySelector('.app-header__title');
  const consolidatedStatusEl = document.querySelector('.app-header__status');
  const manualCheckButton = document.querySelector('.app-header__button');
  const userQueryInput = document.querySelector('.query-section__input');
  const saveQueryButton = document.querySelector('.query-section__button');
  const mainContentArea = document.querySelector('.main-content');
  const recentJobsListDiv = document.querySelector('.job-list');
  const jobDetailsPanelEl = document.querySelector('.details-panel');

  // This DEFAULT_QUERY is used if no query is in storage.
  // For the link to match the service-worker's DEFAULT_USER_QUERY initially (if no user query is set),
  // ensure this string is identical to DEFAULT_USER_QUERY in service-worker.js.
  // Use config.DEFAULT_USER_QUERY as the fallback if storage is empty
  let collapsedJobIds = new Set(); // In-memory store for collapsed job IDs, loaded from storage (via StorageManager)
  let deletedJobIds = new Set(); // In-memory store for explicitly deleted job IDs (via StorageManager)
  let currentlySelectedJobId = null; // Keep track of the currently selected job ID

  // Add a cache for job details to avoid duplicate fetches
  const jobDetailsCache = new Map();
  const CACHE_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes in milliseconds

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
        config.DEFAULT_CONTRACTOR_TIERS_GQL, // Use from config
        config.DEFAULT_SORT_CRITERIA       // Use from config
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

  // Function to fetch job details with caching
  async function fetchJobDetailsWithCache(jobCiphertext) {
    // Check if we have a valid cached version
    const cachedData = jobDetailsCache.get(jobCiphertext);
    if (cachedData && (Date.now() - cachedData.timestamp < CACHE_EXPIRY_MS)) {
      console.log(`Popup: Using cached job details for ${jobCiphertext}`);
      return cachedData.data;
    }

    // If not cached or expired, fetch fresh data
    console.log(`Popup: Fetching fresh job details for ${jobCiphertext}`);
    try {
      const response = await browser.runtime.sendMessage({
        action: "getJobDetails",
        jobCiphertext: jobCiphertext
      });

      if (response && response.jobDetails) {
        // Cache the result with timestamp
        jobDetailsCache.set(jobCiphertext, {
          data: response.jobDetails,
          timestamp: Date.now()
        });
        return response.jobDetails;
      } else {
        console.error("Popup: Failed to get job details from background", response?.error);
        throw new Error(response?.error || "Failed to fetch job details");
      }
    } catch (error) {
      console.error("Popup: Error fetching job details:", error);
      throw error;
    }
  }

  /**
   * Sets the visual selection highlight on a job item.
   * @param {string} jobId The ID of the job item to select.
   */
  function setSelectedJobItem(jobId) {
    // Remove selection from previously selected item
    if (currentlySelectedJobId) {
      const prevSelectedElement = recentJobsListDiv.querySelector(`.job-item[data-job-id="${currentlySelectedJobId}"]`);
      if (prevSelectedElement) {
        prevSelectedElement.classList.remove('job-item--selected');
      }
    }

    // Add selection to the new item
    const newSelectedElement = recentJobsListDiv.querySelector(`.job-item[data-job-id="${jobId}"]`);
    if (newSelectedElement) {
      newSelectedElement.classList.add('job-item--selected');
      currentlySelectedJobId = jobId;
    } else {
      currentlySelectedJobId = null; // Job item not found
    }
  }

  /**
   * Fetches and displays job details in the main details panel (#jobDetailsTooltipEl).
   * @param {string} jobCiphertext - The ciphertext ID of the job.
   */
  async function updateDetailsPanel(jobCiphertext) {
    if (!jobDetailsPanelEl) return;
    jobDetailsPanelEl.innerHTML = '<div class="loading-indicator">Loading details...</div>'; // Show loading indicator
    
    setSelectedJobItem(jobCiphertext); // Highlight the item in the list

    try {
      const details = await fetchJobDetailsWithCache(jobCiphertext);
      
      // Format client stats
      const clientStats = details.buyer?.info?.stats || {};
      const clientActivity = details.opening?.job?.clientActivity || {};
      const questions = details.opening?.questions || [];
      const bidStats = details.applicantsBidsStats || {};
      
      // Get the job description from the opening.job.description field
      const jobDescription = details.opening?.job?.description || '';
      
      // Format client stats
      let clientStatsHTML = '';
      if (clientStats) {
        const totalJobs = clientStats.totalAssignments || 0;
        const totalHours = clientStats.hoursCount || 0;
        const feedbackCount = clientStats.feedbackCount || 0;
        
        clientStatsHTML = `
          <div class="client-stats">
            <strong>Client Info:</strong>
            <span class="client-stat">Jobs Posted: ${totalJobs}</span>
            ${totalHours > 0 ? `<span class="client-stat">${Math.round(totalHours).toLocaleString()}h total</span>` : ''}
            ${feedbackCount > 0 ? `<span class="client-stat">Feedback Count: ${feedbackCount}</span>` : ''}
          </div>
        `;
      }
      
      // Format activity stats
      let activityHTML = '';
      if (clientActivity) {
        const applicants = clientActivity.totalApplicants || 0;
        const invited = clientActivity.totalInvitedToInterview || 0;
        const hired = clientActivity.totalHired || 0;
        const positions = clientActivity.numberOfPositionsToHire || 1;
        
        let lastActivity = 'N/A';
        if (clientActivity.lastBuyerActivity) {
          const lastActivityDate = new Date(clientActivity.lastBuyerActivity);
          const fullTimestamp = `${lastActivityDate.toLocaleDateString()} ${lastActivityDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
          lastActivity = `<span title="${fullTimestamp}">${timeAgo(lastActivityDate)}</span>`;
        }
        
        activityHTML = `
          <div class="client-stats">
            <strong>Job Activity:</strong>
            <span class="client-stat">Applicants: ${applicants}</span>
            <span class="client-stat">Interviews: ${invited}</span>
            <span class="client-stat">Hired: ${hired}/${positions}</span>
            <span class="client-stat">Last Active: ${lastActivity}</span>
          </div>
        `;
      }
      
      // Format bid stats
      let bidStatsHTML = '';
      if (bidStats && (bidStats.avgRateBid?.amount || bidStats.minRateBid?.amount || bidStats.maxRateBid?.amount)) {
        const avgBid = bidStats.avgRateBid?.amount || 0;
        const minBid = bidStats.minRateBid?.amount || 0;
        const maxBid = bidStats.maxRateBid?.amount || 0;
        
        bidStatsHTML = `
          <div class="bid-stats">
            <div class="client-stats">
              <strong>Bid Stats:</strong>
              <span class="client-stat">Avg: $${avgBid.toFixed(2)}</span>
              <span class="client-stat">Range: $${minBid} - $${maxBid}</span>
            </div>
          </div>
        `;
      }
      
      // Format questions
      let questionsHTML = '';
      if (questions && questions.length > 0) {
        questionsHTML = `
          <div class="job-item__questions-section">
            <p><strong>Screening Questions:</strong></p>
            <ol>
              ${questions.map(q => `<li>${q.question}</li>`).join('')}
            </ol>
          </div>
        `;
      }
      
      // Format job description
      let descriptionHTML = '';
      if (jobDescription && jobDescription.trim().length > 0) {
        // Clean up the description - remove HTML tags
        const cleanDescription = jobDescription
          .replace(/<\/?[^>]+(>|$)/g, "") // Remove HTML tags
          .trim();
        
        descriptionHTML = `
          <div class="job-description-section">
            <div class="job-description-content">${cleanDescription.replace(/\n/g, '<br>')}</div>
          </div>
        `;
      }
      
      // Combine all sections
      jobDetailsPanelEl.innerHTML = `
        ${clientStatsHTML}
        ${activityHTML}
        ${bidStatsHTML}
        ${questionsHTML}
        ${descriptionHTML}
      `;
    } catch (error) {
      jobDetailsPanelEl.innerHTML = `
        <p class="error-message">Failed to load job details: ${error.message}. Please try again later.</p>
      `;
    }
  }

  function createJobItemHTML(job, isInitiallyCollapsed) { // BEM Refactor
    const jobUrl = `https://www.upwork.com/jobs/${job.ciphertext || job.id}`;
    let budgetDisplay = 'N/A';
    if (job.budget && job.budget.amount != null) {
      budgetDisplay = `${job.budget.amount} ${job.budget.currencyCode || ''}`;
      if (job.budget.type && job.budget.type.toLowerCase() !== 'fixed') {
        budgetDisplay += ` (${job.budget.type.toLowerCase().replace('_', '-')})`;
      }
    }

    let clientInfo = 'Client info N/A';
    let clientModifiers = [];
    if (job.client) {
      clientInfo = `Client: ${job.client.country || 'N/A'}`;
      if (job.client.rating != null) {
        const rating = parseFloat(job.client.rating);
        clientInfo += ` | Rating: ${rating.toFixed(2)}`;
          if (rating >= 4.9) clientModifiers.push('job-item--high-rating');
      }
      if (job.client.totalSpent != null && Number(job.client.totalSpent) > 0) {
        const spentAmount = Number(job.client.totalSpent);
        if (spentAmount > 10000) { // Threshold for high spender
          clientInfo += ` | <span class="client-spent positive" title="High Spender Client">Spent: $${spentAmount.toFixed(0)}</span>`;
        } else {
          clientInfo += ` | <span class="client-spent">Spent: $${spentAmount.toFixed(0)}</span>`;
        }
      }
      if (job.client.paymentVerificationStatus !== 'VERIFIED') {
        clientInfo += ' <span class="unverified-icon" title="Client payment not verified">⚠️</span>';
      }
    }

    let skillsDisplay = '';
    if (job.skills && job.skills.length > 0) {
      skillsDisplay = `Skills: ${job.skills.map(s => s.name).slice(0, 3).join(', ')}${job.skills.length > 3 ? '...' : ''}`;
    }

    const appliedIconHTML = job.applied ? `
      <span class="job-item__applied-icon" title="You applied to this job">
        <img src="icons/applied-icon.svg" alt="Applied to job" class="air3-icon sm" data-test="UpCIcon" />
      </span>` : '';

    let priorityTagHTML = '';
    if (job.isExcludedByTitleFilter) {
      priorityTagHTML = '<span class="job-item__priority-tag">Filtered</span>';
    } else if (job.isLowPriorityByClientCountry && job.client && job.client.country) {
      const countryName = job.client.country.charAt(0).toUpperCase() + job.client.country.slice(1).toLowerCase();
      priorityTagHTML = `<span class="job-item__priority-tag">${countryName}</span>`;
    } else if (job.isLowPriorityBySkill) {
      priorityTagHTML = '<span class="job-item__priority-tag">Skill</span>';
    }

    const isLowPriority = job.isLowPriorityBySkill || job.isLowPriorityByClientCountry;
    let jobItemModifiers = [];
    if (isInitiallyCollapsed) {
      jobItemModifiers.push('job-item--collapsed');
    }
    if (isLowPriority) {
      jobItemModifiers.push('job-item--low-priority');
    }
    if (job.isExcludedByTitleFilter) {
      jobItemModifiers.push('job-item--excluded');
    }
    if (job.applied) {
      jobItemModifiers.push('job-item--applied');
    }
    jobItemModifiers.push(...clientModifiers);

    const jobItemClasses = `job-item ${jobItemModifiers.join(' ')}`.trim();

    return `
      <div class="${jobItemClasses}" data-job-id="${job.id}">
        <div class="job-item__header">
          <span class="job-item__toggle">${isInitiallyCollapsed ? '+' : '-'}</span>
          <h3 class="job-item__title-container">
            ${appliedIconHTML}
            ${priorityTagHTML}
            <a href="${jobUrl}" target="_blank" data-ciphertext="${job.ciphertext || job.id}" class="job-item__title">${job.title || 'No Title'}</a>
          </h3>
          <span class="job-item__delete-btn" title="Remove from list">×</span>
        </div>
        <div class="job-item__details">
          <p class="job-item__meta"><strong>Budget:</strong> ${budgetDisplay}</p>
          <p class="job-item__meta">${clientInfo}</p>
          ${skillsDisplay ? `<p class="job-item__skills">${skillsDisplay}</p>` : ''}
          <p class="job-item__meta"><small>Posted: ${job.postedOn ? new Date(job.postedOn).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) + ', ' + new Date(job.postedOn).toLocaleDateString() : 'N/A'} <b>(${timeAgo(job.postedOn)})</b></small></p>
        </div>
      </div>
    `;
  }

  function displayRecentJobs(jobs = []) {
    console.log("Popup: displayRecentJobs called with:", jobs);
    recentJobsListDiv.innerHTML = '';
    currentlySelectedJobId = null; // Reset selected job when list re-renders

    if (!Array.isArray(jobs) || jobs.length === 0) {
      console.log("Popup: No valid jobs array to display or jobs array is empty.");
      recentJobsListDiv.innerHTML = '<p class="no-jobs">No new jobs found in the last check.</p>';
      //recentJobsListDiv.classList.add('empty-list');
      mainContentArea.classList.add('empty-list'); // Add empty list class to main content area
      if (jobDetailsPanelEl) jobDetailsPanelEl.innerHTML = '<p class="no-jobs">No jobs to display details for.</p>'; // Clear panel
      return;
    }

    // Filter out jobs that have been explicitly deleted
    const jobsToDisplay = jobs.filter(job => job && job.id && !deletedJobIds.has(job.id));

    if (jobsToDisplay.length === 0) {
      console.log("Popup: No jobs to display after filtering deleted items.");
      recentJobsListDiv.innerHTML = '<p class="no-jobs">No new jobs found (all previously seen or deleted).</p>';
      //recentJobsListDiv.classList.add('empty-list');
      mainContentArea.classList.add('empty-list'); // Add empty list class to main content area
      if (jobDetailsPanelEl) jobDetailsPanelEl.innerHTML = '<p class="no-jobs">No jobs to display details for.</p>'; // Clear panel
    } else {
      console.log(`Popup: Displaying ${jobsToDisplay.length} jobs (filtered from ${jobs.length} total recent).`);
      jobsToDisplay.forEach((job, index) => {
        if (!job || !job.id) {
          console.warn(`Popup: Skipping job at index ${index} due to missing job or job.id`, job);
          return;
        }

        // A job is initially collapsed if its ID is in the collapsedJobIds set.
        // The background script is responsible for adding new low-priority/filtered jobs to this set.
        const isInitiallyCollapsed = collapsedJobIds.has(job.id);
        const jobItemHTML = createJobItemHTML(job, isInitiallyCollapsed);
        recentJobsListDiv.insertAdjacentHTML('beforeend', jobItemHTML);
      });
      //recentJobsListDiv.classList.remove('empty-list');
      mainContentArea.classList.remove('empty-list'); // Remove empty list class from main content area

      // After displaying jobs, find the first non-filtered job and show its details
      const firstNonFilteredJob = jobsToDisplay.find(job => job && !job.isExcludedByTitleFilter);
      if (firstNonFilteredJob && firstNonFilteredJob.id) {
        updateDetailsPanel(firstNonFilteredJob.id); // This will also call setSelectedJobItem
      } else if (jobDetailsPanelEl) {
        jobDetailsPanelEl.innerHTML = '<p class="no-jobs">No job selected or available for details.</p>';
        setSelectedJobItem(null); // Clear any selection if no suitable job
      }
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

  async function triggerCheck(queryToUse) { // Made async
    updateConsolidatedStatusDisplay({ monitorStatusText: 'Checking...' });
    console.log("Popup: Triggering check with query:", queryToUse);

    try {
      const response = await browser.runtime.sendMessage({ action: "manualCheck", userQuery: queryToUse });
      console.log("Popup: Manual check message sent, background responded:", response);
      // Background will now send "updatePopupDisplay" when it's truly done.
      // We can reflect the immediate response from background here if needed.
    } catch (error) {
      console.error("Popup: Error sending manual check message:", error.message);
      loadStoredData(); // Attempt to refresh with current state on error
    }
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
  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updatePopupDisplay") {
      console.log("Popup: Received updatePopupDisplay message from background. Refreshing data.");
      loadStoredData();
      if (sendResponse) sendResponse({ status: "Popup display refreshed."});
      return true; 
    }
  });

  // Add a listener for storage changes to keep the popup data up-to-date
  browser.storage.onChanged.addListener((changes, areaName) => {
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
    const jobItemElement = event.target.closest('.job-item');
    if (!jobItemElement) return;

    const jobId = jobItemElement.dataset.jobId;
    const toggleButton = event.target.closest('.job-item__toggle');
    const deleteButton = event.target.closest('.job-item__delete-btn');

    if (toggleButton && jobId) {
      event.stopPropagation();
      console.log(`Popup: Toggling job ID: ${jobId}`);
      
      const isNowCollapsed = jobItemElement.classList.toggle('job-item--collapsed');
      toggleButton.textContent = isNowCollapsed ? '+' : '-';

      if (isNowCollapsed) {
        collapsedJobIds.add(jobId);
      } else {
        collapsedJobIds.delete(jobId);
      }
      saveCollapsedState();

    } else if (deleteButton && jobId) {
      event.stopPropagation();
      console.log(`Popup: Deleting job ID: ${jobId}`);
      jobItemElement.remove();
      deletedJobIds.add(jobId);
      saveDeletedState();

      // If the deleted job was the one selected, clear the details panel
      if (jobId === currentlySelectedJobId) {
        if (jobDetailsPanelEl) jobDetailsPanelEl.innerHTML = '<p class="no-jobs">Job removed. Select another job to see details.</p>';
        currentlySelectedJobId = null;
      }

      StorageManager.getRecentFoundJobs().then(currentRecentJobs => {
        StorageManager.setRecentFoundJobs(currentRecentJobs.filter(item => item.id !== jobId));
      });
    }
  });

  // --- IntersectionObserver for Pre-fetching Job Details for Tooltips ---
  let jobItemObserver;
  function setupIntersectionObserver() {
    if (jobItemObserver) {
      jobItemObserver.disconnect(); // Disconnect previous observer if any
    }

    const observerOptions = {
      root: recentJobsListDiv, // Observe within the scrollable job list container
      rootMargin: '0px',
      threshold: 0.1 // Trigger when 10% of the item is visible
    };

    jobItemObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const jobItem = entry.target;
          const jobCiphertext = jobItem.dataset.jobCiphertextForTooltip; // Use a specific data attribute
          if (jobCiphertext) {
            // Pre-fetch details if not already in cache or being fetched
            const cachedData = jobDetailsCache.get(jobCiphertext);
            if (!cachedData || (Date.now() - cachedData.timestamp >= CACHE_EXPIRY_MS)) {
              console.log(`Popup (Observer): Pre-fetching details for visible job ${jobCiphertext}`);
              fetchJobDetailsWithCache(jobCiphertext).catch(err => {
                // console.warn(`Popup (Observer): Failed to pre-fetch for ${jobCiphertext}`, err.message);
                // Silently fail pre-fetching, hover will trigger a fetch anyway
              });
            }
            // observer.unobserve(jobItem); // Optional: Unobserve after pre-fetching to save resources
                                        // Keep observing if items can scroll in and out multiple times
          }
        }
      });
    }, observerOptions);

    // Observe existing and future .job-item elements
    document.querySelectorAll('#recentJobsList .job-item').forEach(item => {
        if (item.dataset.jobCiphertextForTooltip) jobItemObserver.observe(item);
    });
  }


  // Set up a mutation observer to handle dynamically added job links
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        setupIntersectionObserver(); // Re-run to observe new items
      }
    });
  });
  
  observer.observe(recentJobsListDiv, { childList: true, subtree: true });
  
  // Initial setup
  setupIntersectionObserver(); // Initial setup for IntersectionObserver

  // Add this line
  console.log("Popup: Added storage listener.");

  // --- Event listeners for the new tooltip ---
  recentJobsListDiv.addEventListener('mouseenter', async (event) => {
    const jobItemElement = event.target.closest('.job-item');
    if (jobItemElement) {
      const jobCiphertext = jobItemElement.dataset.jobId; 
      if (!jobCiphertext) {
        console.warn("Popup: job-item missing data-job-id for details panel.", jobItemElement);
        return;
      }
      // Ensure IntersectionObserver can pick it up if it hasn't already
      if (!jobItemElement.dataset.jobCiphertextForTooltip) {
        jobItemElement.dataset.jobCiphertextForTooltip = jobCiphertext;
        if (jobItemObserver) jobItemObserver.observe(jobItemElement); // Observe if not already
      }

      // Only update if it's not already selected, to avoid redundant updates
      // and potential flicker if updateDetailsPanel is slow.
      if (jobCiphertext !== currentlySelectedJobId) {
        updateDetailsPanel(jobCiphertext);
      }
    }
  }, true); // Use capture phase to ensure it runs

  // No mouseleave needed for recentJobsListDiv to hide the panel, as it's persistent.
  // No mouseenter/mouseleave needed for jobDetailsTooltipEl itself for this interaction model.

  loadStoredData(); // Initial load
});

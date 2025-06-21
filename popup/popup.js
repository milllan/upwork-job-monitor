// popup.js
document.addEventListener('DOMContentLoaded', () => {
  // Assuming StorageManager is loaded via popup.html
  const popupTitleLinkEl = document.querySelector('.app-header__title');
  const consolidatedStatusEl = document.querySelector('.app-header__status');
  const manualCheckButton = document.querySelector('.app-header__button');
  const themeToggleButton = document.getElementById('theme-toggle-button');
  const userQueryInput = document.querySelector('.query-section__input');
  const saveQueryButton = document.querySelector('.query-section__button');
  const mainContentArea = document.querySelector('.main-content');
  const jobListContainerEl = document.querySelector('.job-list-container');
  const recentJobsListDiv = document.querySelector('.job-list');
  const jobDetailsPanelEl = document.querySelector('.details-panel');
  const themeStylesheet = document.getElementById('theme-stylesheet');
  const jobItemTemplate = document.getElementById('job-item-template');
  const jobDetailsTemplate = document.getElementById('job-details-template');
  let jobDetailsComponent; // Will be initialized in DOMContentLoaded

  // This DEFAULT_QUERY is used if no query is in storage.
  // For the link to match the service-worker's DEFAULT_USER_QUERY initially (if no user query is set),
  // ensure this string is identical to DEFAULT_USER_QUERY in service-worker.js.
  // Use config.DEFAULT_USER_QUERY as the fallback if storage is empty
  let collapsedJobIds = new Set(); // In-memory store for collapsed job IDs, loaded from storage (via StorageManager)
  let deletedJobIds = new Set(); // In-memory store for explicitly deleted job IDs (via StorageManager)
  let currentlySelectedJobId = null; // Keep track of the currently selected job ID
  let jobItemComponents = new Map(); // Map of job ID -> JobItem component instance
  let currentTheme = 'light'; // Default state, will be updated from storage

  // In-memory state for UI elements that are updated partially, to avoid reading from the DOM.
  const popupState = {
    monitorStatusText: 'Initializing...',
    lastCheckTimestamp: null,
    deletedJobsCount: 0
  };

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

  /**
   * Sets the UI theme by changing the stylesheet and updating the toggle button.
   * @param {string} theme - The theme to set ('light' or 'dark').
   */
  function setTheme(theme) {
    if (!themeStylesheet || !themeToggleButton) return;

    if (theme === 'dark') {
      themeStylesheet.href = 'popup-dark.css';
      themeToggleButton.textContent = '☀️'; // Sun icon for switching to light mode
      themeToggleButton.title = "Switch to Light Mode";
    } else { // Default to light
      themeStylesheet.href = 'popup.css';
      themeToggleButton.textContent = '🌙'; // Moon icon for switching to dark mode
      themeToggleButton.title = "Switch to Dark Mode";
    }
    currentTheme = theme;
    StorageManager.setUiTheme(theme);
  }

  /**
   * Updates the consolidated status display in the header.
   * This function updates an in-memory state object and then re-renders the display.
   * @param {object} data - An object with partial data to update.
   * @param {string} [data.monitorStatusText] - The new monitor status text.
   * @param {number|null} [data.lastCheckTimestamp] - The timestamp of the last check.
   * @param {number} [data.deletedJobsCount] - The count of deleted jobs.
   */
  function updateConsolidatedStatusDisplay(data = {}) {
    if (!consolidatedStatusEl) return;

    // 1. Update the in-memory state with any new data provided.
    if (data.monitorStatusText !== undefined) popupState.monitorStatusText = data.monitorStatusText;
    if (data.lastCheckTimestamp !== undefined) {
      popupState.lastCheckTimestamp = data.lastCheckTimestamp;
    }
    if (data.deletedJobsCount !== undefined) popupState.deletedJobsCount = data.deletedJobsCount;

    // 2. Prepare display strings from the (now updated) state.
    const statusText = popupState.monitorStatusText || 'Idle';
    const deletedCount = popupState.deletedJobsCount || 0;
    let lastCheckDisplay = 'N/A';
    if (popupState.lastCheckTimestamp) {
      const lastCheckDate = new Date(popupState.lastCheckTimestamp);
      const timeString = lastCheckDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      lastCheckDisplay = `${timeString} (${timeAgo(lastCheckDate)})`;
    }

    // 3. Render the UI from the state.
    consolidatedStatusEl.innerHTML =
      `<span class="app-header__status-tag" title="Current monitor status">${statusText}</span>` +
      `<span class="app-header__status-tag" title="Last successful check time">Last: ${lastCheckDisplay}</span>` +
      `<span class="app-header__status-tag" title="Jobs you've deleted from the list">Del: ${deletedCount}</span>`;
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
    if (!jobDetailsComponent) return;
    jobDetailsComponent.showLoading();
    
    setSelectedJobItem(jobCiphertext); // Highlight the item in the list

    try {
      const details = await fetchJobDetailsWithCache(jobCiphertext);
      jobDetailsComponent.render(details);
    } catch (error) {
      jobDetailsComponent.showError(error);
    }
  }

  // --- Component Event Handlers ---

  /**
   * Handles the toggle event from a JobItem component.
   * @param {string} jobId The ID of the job being toggled.
   * @param {boolean} isNowCollapsed The new collapsed state.
   */
  function handleJobToggle(jobId, isNowCollapsed) {
    if (isNowCollapsed) {
      collapsedJobIds.add(jobId);
    } else {
      collapsedJobIds.delete(jobId);
    }
    saveCollapsedState();
  }

  /**
   * Handles the delete event from a JobItem component.
   * @param {string} jobId The ID of the job to delete.
   */
  function handleJobDelete(jobId) {
    const component = jobItemComponents.get(jobId);
    if (component) {
      component.destroy();
      jobItemComponents.delete(jobId);
    }

    deletedJobIds.add(jobId);
    saveDeletedState();

    if (jobId === currentlySelectedJobId) {
      jobDetailsComponent.showInitialMessage('Job removed. Select another job.');
      currentlySelectedJobId = null;
    }

    // Also remove from the master list in storage
    StorageManager.getRecentFoundJobs().then(currentJobs => {
      const updatedJobs = currentJobs.filter(j => j.id !== jobId);
      StorageManager.setRecentFoundJobs(updatedJobs);
    });
  }

  /**
   * Handles the select event from a JobItem component (on mouseenter).
   * @param {string} jobCiphertext The ciphertext of the job to select.
   */
  function handleJobSelect(jobCiphertext) {
    if (jobCiphertext !== currentlySelectedJobId) {
      updateDetailsPanel(jobCiphertext);
    }
  }

  function displayRecentJobs(jobs = []) {
    console.log("Popup: displayRecentJobs called with:", jobs);

    const jobsToDisplay = jobs.filter(job => job && job.id && !deletedJobIds.has(job.id));

    // --- 1. Handle Empty List ---
    if (jobsToDisplay.length === 0) {
      recentJobsListDiv.innerHTML = '<p class="job-list__no-jobs">No new jobs found.</p>';
      mainContentArea.classList.add('empty-list');
      jobDetailsComponent.showInitialMessage('No jobs to display.');
      currentlySelectedJobId = null;
      jobItemComponents.forEach(c => c.destroy());
      jobItemComponents.clear();
      setupIntersectionObserver([]);
      return;
    }

    mainContentArea.classList.remove('empty-list');

    // --- 2. Destroy old components and prepare for new render ---
    jobItemComponents.forEach(c => c.destroy());
    jobItemComponents.clear();
    const fragment = document.createDocumentFragment();
    let firstNonFilteredJob = null;

    // --- 3. Create and Render New Components ---
    jobsToDisplay.forEach(job => {
      if (!firstNonFilteredJob && !job.isExcludedByTitleFilter) {
        firstNonFilteredJob = job;
      }

      const jobComponent = new JobItem(job, {
        isCollapsed: collapsedJobIds.has(job.id),
        onToggle: handleJobToggle,
        onDelete: handleJobDelete,
        onSelect: handleJobSelect,
      });

      jobItemComponents.set(job.id, jobComponent);
      fragment.appendChild(jobComponent.render());
    });

    // --- 4. Append to DOM and Update Details Panel ---
    recentJobsListDiv.replaceChildren(fragment);

    if (firstNonFilteredJob && firstNonFilteredJob.id) {
      handleJobSelect(firstNonFilteredJob.id);
    } else {
      jobDetailsComponent.showInitialMessage('No job selected.');
      setSelectedJobItem(null);
    }

    // --- 5. Re-initialize Intersection Observer ---
    setupIntersectionObserver(Array.from(jobItemComponents.values()).map(c => c.element));
  }

  // Refactored loadStoredData to use StorageManager
  async function loadStoredData() {
    console.log("Popup: loadStoredData called.");
    try {
      const [monitorStatus, lastCheckTimestamp, currentUserQuery, recentFoundJobs, loadedCollapsedIds, loadedDeletedIds, loadedTheme] = await Promise.all([
        StorageManager.getMonitorStatus(),
        StorageManager.getLastCheckTimestamp(),
        StorageManager.getCurrentUserQuery(),
        StorageManager.getRecentFoundJobs(),
        StorageManager.getCollapsedJobIds(),
        StorageManager.getDeletedJobIds(),
        StorageManager.getUiTheme()
      ]);

      const currentQuery = currentUserQuery || config.DEFAULT_USER_QUERY; // Use config default if storage is empty
      userQueryInput.value = currentQuery; // Set input value
      deletedJobIds = loadedDeletedIds; // Update in-memory sets
      collapsedJobIds = loadedCollapsedIds;
      
      setTheme(loadedTheme); // Apply the theme
      // Update UI elements
      updateConsolidatedStatusDisplay({ monitorStatusText: monitorStatus, lastCheckTimestamp: lastCheckTimestamp, deletedJobsCount: deletedJobIds.size });
      updatePopupTitleLink(currentQuery); // Update title link

      displayRecentJobs(recentFoundJobs); // Display jobs

    } catch (error) {
      console.error("Popup: Error in loadStoredData Promise.all:", error, error.stack ? error.stack : '(no stack trace)');
      updateConsolidatedStatusDisplay({ monitorStatusText: 'Error loading status' });
      recentJobsListDiv.innerHTML = '<p class="job-list__no-jobs">Error loading job data.</p>';
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

  themeToggleButton.addEventListener('click', () => {
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
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

  // --- IntersectionObserver for Pre-fetching Job Details for Tooltips ---
  let jobItemObserver = null;
  function setupIntersectionObserver(elementsToObserve = []) {
    if (jobItemObserver) {
      jobItemObserver.disconnect(); // Disconnect previous observer if any
    }

    if (elementsToObserve.length === 0) return;

    const observerOptions = {
      root: recentJobsListDiv, // Observe within the scrollable job list container
      rootMargin: '0px',
      threshold: 0.1 // Trigger when 10% of the item is visible
    };

    jobItemObserver = new IntersectionObserver(async (entries, observer) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const jobItem = entry.target;
          const jobCiphertext = jobItem.dataset.ciphertextForTooltip;
          if (jobCiphertext) {
            const cachedData = jobDetailsCache.get(jobCiphertext);
            if (!cachedData || (Date.now() - cachedData.timestamp >= CACHE_EXPIRY_MS)) {
              console.log(`Popup (Observer): Pre-fetching details for visible job ${jobCiphertext}`);
              try { await fetchJobDetailsWithCache(jobCiphertext); } catch (err) { /* silent fail */ }
            }
          }
        }
      }
    }, observerOptions);

    // Observe existing and future .job-item elements
    elementsToObserve.forEach(item => {
      if (item && item.dataset.ciphertextForTooltip) {
        jobItemObserver.observe(item);
      }
    });
  }

    // Initialize JobDetails component
    if (typeof JobDetails === 'undefined') {
      console.error("Initialization Error: JobDetails class is not defined. Please ensure popup/components/JobDetails.js is loaded correctly and without errors.");
      if (jobDetailsPanelEl) {
        jobDetailsPanelEl.innerHTML = '<p class="details-panel__error">Initialization failed: Job details component missing. Try reloading the extension.</p>';
      }
      return; // Stop further execution if a critical component is missing
    }
    jobDetailsComponent = new JobDetails(jobDetailsPanelEl);

    console.log("Popup: DOMContentLoaded complete. Loading stored data...");

  loadStoredData(); // Initial load

  // Initialize UI enhancements like scroll hints
  UJM_UI.initializeScrollHints(jobListContainerEl, recentJobsListDiv);
});

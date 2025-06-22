// popup.js
document.addEventListener('DOMContentLoaded', async () => {
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

  // Initialize AppState for centralized state management
  const appState = new AppState();
  await appState.loadFromStorage();

  // This DEFAULT_QUERY is used if no query is in storage.
  // For the link to match the service-worker's DEFAULT_USER_QUERY initially (if no user query is set),
  // ensure this string is identical to DEFAULT_USER_QUERY in service-worker.js.
  let jobItemComponents = new Map(); // Map of job ID -> JobItem component instance

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
   * Updates the UI theme based on the current state in AppState.
   */
  function updateThemeUI() {
    const theme = appState.getTheme();
    if (!themeStylesheet || !themeToggleButton) return;

    if (theme === 'dark') {
      themeStylesheet.href = 'popup-dark.css';
      themeToggleButton.textContent = '☀️'; // Sun icon for switching to light mode
      themeToggleButton.title = "Switch to Light Mode";
    } else {
      themeStylesheet.href = 'popup.css';
      themeToggleButton.textContent = '🌙'; // Moon icon for switching to dark mode
      themeToggleButton.title = "Switch to Dark Mode";
    }
  }

  /**
   * Renders the consolidated status display in the header based on the current AppState.
   * This function is called by AppState subscribers.
   */
  function renderStatusHeader() {
    if (!consolidatedStatusEl) return;

    // 1. Read all required data directly from AppState.
    const statusText = appState.getMonitorStatus() || 'Idle';
    const deletedCount = appState.getDeletedJobsCount();
    const lastCheckTimestamp = appState.getLastCheckTimestamp();
    let lastCheckDisplay = 'N/A';
    if (lastCheckTimestamp) {
      const lastCheckDate = new Date(lastCheckTimestamp);
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
    const cachedData = appState.getCachedJobDetails(jobCiphertext);
    if (cachedData) {
      console.log(`Popup: Using cached job details for ${jobCiphertext}`);
      return cachedData;
    } else {
      console.log(`Popup: Fetching fresh job details for ${jobCiphertext}`);
      const response = await browser.runtime.sendMessage({
        action: "getJobDetails",
        jobCiphertext: jobCiphertext
      });

      if (response && response.jobDetails) {
        // Cache the result with timestamp
        appState.setCachedJobDetails(jobCiphertext, response.jobDetails);
        return response.jobDetails;
      } else {
        console.error("Popup: Failed to get job details from background", response?.error);
        throw new Error(response?.error || "Failed to fetch job details");
      }
    }
  }

  /**
   * Sets the selected job in the application state.
   * The UI update is handled reactively by a state subscriber.
   * @param {string} jobId The ID of the job item to select.
   */
  function setSelectedJobItem(jobId) {
    appState.setSelectedJobId(jobId);
  }

  /**
   * Updates the UI to visually reflect the currently selected job item.
   * This function is called by the AppState subscriber.
   * @param {string|null} newJobId The newly selected job ID.
   * @param {string|null} oldJobId The previously selected job ID.
   */
  function updateJobSelectionUI(newJobId, oldJobId) {
    // Remove selection from previously selected item
    if (oldJobId) {
      const prevSelectedElement = recentJobsListDiv.querySelector(`.job-item[data-job-id="${oldJobId}"]`);
      if (prevSelectedElement) {
        prevSelectedElement.classList.remove('job-item--selected');
      }
    }

    // Add selection to the new item
    if (newJobId) {
      const newSelectedElement = recentJobsListDiv.querySelector(`.job-item[data-job-id="${newJobId}"]`);
      if (newSelectedElement) {
        newSelectedElement.classList.add('job-item--selected');
      }
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
    appState.toggleJobCollapse(jobId);
  }

  /**
   * Handles the delete event from a JobItem component.
   * @param {string} jobId The ID of the job to delete.
   */
  function handleJobDelete(jobId) {
    // The component will be destroyed and removed from the DOM when
    // the list re-renders via the state subscriber.
    // We just need to trigger the state change.
    appState.deleteJob(jobId);
  }

  /**
   * Handles the select event from a JobItem component (on mouseenter).
   * @param {string} jobCiphertext The ciphertext of the job to select.
   */
  function handleJobSelect(jobCiphertext) {
    if (jobCiphertext !== appState.getSelectedJobId()) {
      updateDetailsPanel(jobCiphertext);
    }
  }

  function displayRecentJobs(jobs = []) {
    console.log("Popup: displayRecentJobs called with:", jobs);

    const jobsToDisplay = jobs.filter(job => job && job.id && !appState.getDeletedJobIds().has(job.id));

    // --- 1. Handle Empty List ---
    if (jobsToDisplay.length === 0) {
      recentJobsListDiv.innerHTML = '<p class="job-list__no-jobs">No new jobs found.</p>';
      mainContentArea.classList.add('empty-list');
      jobDetailsComponent.showInitialMessage('No jobs to display.');
      appState.setSelectedJobId(null);
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
        // A job is collapsed if it's marked as low-priority/filtered (default state),
        // OR if the user has manually collapsed it via the toggle.
        isCollapsed: job.isLowPriorityBySkill || job.isLowPriorityByClientCountry ||
                       job.isExcludedByTitleFilter || appState.getCollapsedJobIds().has(job.id),
        onToggle: handleJobToggle,
        onDelete: handleJobDelete,
        onSelect: handleJobSelect,
      });

      jobItemComponents.set(job.id, jobComponent);
      fragment.appendChild(jobComponent.render());
    });

    // --- 4. Append to DOM anEd Update Details Panel ---
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

  /**
   * Initializes the UI with data from the already-loaded AppState.
   * This is called once after the initial state load.
   */
  function initializeUIFromState() {
    console.log("Popup: Initializing UI from state.");
    const state = appState.getState();

    userQueryInput.value = state.currentUserQuery;
    updatePopupTitleLink(state.currentUserQuery);
    displayRecentJobs(state.jobs);

    // Initial renders are now handled by subscribers, but we can call them
    // once here to ensure the UI is populated immediately without waiting for a "change".
    updateThemeUI();
    renderStatusHeader();
  }

  async function triggerCheck(queryToUse) { // Made async
    // Update the state, which will trigger the UI update via the subscriber.
    appState.updateMonitorStatus('Checking...');
    console.log("Popup: Triggering check with query:", queryToUse);

    try {
      const response = await browser.runtime.sendMessage({ action: "manualCheck", userQuery: queryToUse });
      console.log("Popup: Manual check message sent, background responded:", response);
      // Background will now send "updatePopupDisplay" when it's truly done.
      // We can reflect the immediate response from background here if needed.
    } catch (error) {
      console.error("Popup: Error sending manual check message:", error.message);
      appState.loadFromStorage(); // Attempt to refresh with current state on error
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
    const currentTheme = appState.getTheme();
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    appState.setTheme(newTheme);
  });

  // Listen for messages from background script to update the display
  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updatePopupDisplay") { 
      console.log("Popup: Received updatePopupDisplay message from background. Refreshing data.");
      // Reload state from storage. This will trigger all necessary UI updates
      // via the subscribers, ensuring a consistent, state-driven refresh.
      appState.loadFromStorage();
      if (sendResponse) sendResponse({ status: "Popup display refreshed."});
      return true; 
    }
  });

  // --- AppState Subscribers ---
  // Centralized setup for all reactive UI updates.
  appState.subscribeToSelector('theme', updateThemeUI); // For theme changes
  appState.subscribeToSelector('selectedJobId', updateJobSelectionUI); // For job selection highlighting
  appState.subscribeToSelector('deletedJobIds', () => { // For job deletion
    renderStatusHeader(); // Update header for deleted count
    // Re-render the job list using the jobs currently in the state
    displayRecentJobs(appState.getJobs());
  });
  // For status header text changes
  appState.subscribeToSelector('monitorStatus', renderStatusHeader);
  appState.subscribeToSelector('lastCheckTimestamp', renderStatusHeader);

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
          if (jobCiphertext && !appState.getCachedJobDetails(jobCiphertext)) {
            console.log(`Popup (Observer): Pre-fetching details for visible job ${jobCiphertext}`);
            try { await fetchJobDetailsWithCache(jobCiphertext); } catch (err) { /* silent fail */ }
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

  initializeUIFromState(); // Initial UI setup from loaded state

  // Initialize UI enhancements like scroll hints
  UJM_UI.initializeScrollHints(jobListContainerEl, recentJobsListDiv);
});

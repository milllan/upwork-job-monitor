// popup.js
document.addEventListener('DOMContentLoaded', async () => {
  // Assuming StorageManager is loaded via popup.html
  const popupTitleLinkEl = document.querySelector('.app-header__title');
  const consolidatedStatusEl = document.querySelector('.app-header__status');
  const manualCheckButton = document.querySelector('.app-header__button');
  const themeToggleButton = document.getElementById('theme-toggle-button'); // Keep this, it's not part of SearchForm
  const mainContentArea = document.querySelector('.main-content');
  const jobListContainerEl = document.querySelector('.job-list-container');
  const recentJobsListDiv = document.querySelector('.job-list');
  const jobDetailsPanelEl = document.querySelector('.details-panel');
  const themeStylesheet = document.getElementById('theme-stylesheet');
  //const jobItemTemplate = document.getElementById('job-item-template');
  //const jobDetailsTemplate = document.getElementById('job-details-template');
  // eslint-disable-next-line prefer-const
  let searchFormComponent; // Will be initialized in DOMContentLoaded
  // eslint-disable-next-line prefer-const
  let jobDetailsComponent; // Will be initialized in DOMContentLoaded
  // eslint-disable-next-line prefer-const
  let apiService; // Will be initialized in DOMContentLoaded
  // eslint-disable-next-line prefer-const
  let statusHeaderComponent; // Will be initialized in DOMContentLoaded

  // Initialize AppState for centralized state management
  const appState = new AppState();
  await appState.loadFromStorage();

  // This DEFAULT_QUERY is used if no query is in storage.
  // For the link to match the service-worker's DEFAULT_USER_QUERY initially (if no user query is set),
  // ensure this string is identical to DEFAULT_USER_QUERY in service-worker.js.

  function updatePopupTitleLink(currentQuery) {
    if (popupTitleLinkEl) {
      const url = constructUpworkSearchURL(
        currentQuery,
        config.DEFAULT_CONTRACTOR_TIERS_GQL, // Use from config
        config.DEFAULT_SORT_CRITERIA // Use from config
      );
      popupTitleLinkEl.href = url;
    }
  }

  /**
   * Updates the UI theme based on the current state in AppState.
   */
  function updateThemeUI() {
    const theme = appState.getTheme();
    if (!themeStylesheet || !themeToggleButton) {
      return;
    }

    if (theme === 'dark') {
      themeStylesheet.href = 'popup-dark.css';
      themeToggleButton.textContent = '☀️'; // Sun icon for switching to light mode
      themeToggleButton.title = 'Switch to Light Mode';
    } else {
      themeStylesheet.href = 'popup.css';
      themeToggleButton.textContent = '🌙'; // Moon icon for switching to dark mode
      themeToggleButton.title = 'Switch to Dark Mode';
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
      const prevSelectedElement = recentJobsListDiv.querySelector(
        `.job-item[data-job-id="${oldJobId}"]`
      );
      if (prevSelectedElement) {
        prevSelectedElement.classList.remove('job-item--selected');
      }
    }

    // Add selection to the new item
    if (newJobId) {
      const newSelectedElement = recentJobsListDiv.querySelector(
        `.job-item[data-job-id="${newJobId}"]`
      );
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
    if (!jobDetailsComponent) {
      return;
    }
    jobDetailsComponent.showLoading();

    setSelectedJobItem(jobCiphertext); // Highlight the item in the list

    try {
      const details = await apiService.fetchJobDetailsWithCache(jobCiphertext);
      jobDetailsComponent.render(details);
    } catch (error) {
      jobDetailsComponent.showError(error);
    }
  }

  // --- Component Event Handlers ---

  /**
   * Handles the toggle event from a JobItem component.
   * @param {string} jobId The ID of the job being toggled.
   * @param {boolean} _isNowCollapsed The new collapsed state.
   */
  function handleJobToggle(jobId, _isNowCollapsed) {
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

  function displayRecentJobs() {
    console.log('Popup: displayRecentJobs called.');
    const jobsToDisplay = appState.getVisibleJobs();

    // --- 1. Handle Empty List ---
    if (jobsToDisplay.length === 0) {
      recentJobsListDiv.innerHTML = '<p class="job-list__no-jobs">No new jobs found.</p>';
      mainContentArea.classList.add('empty-list');
      jobDetailsComponent.showInitialMessage('No jobs to display.');
      appState.setSelectedJobId(null);
      appState.clearJobComponents();
      setupIntersectionObserver([]);
      return;
    }

    mainContentArea.classList.remove('empty-list');

    // --- 2. Destroy old components and prepare for new render ---
    appState.clearJobComponents(); // Destroys old components and clears map in state
    const fragment = document.createDocumentFragment();
    let firstNonFilteredJob = null;

    // --- 3. Create and Render New Components ---
    jobsToDisplay.forEach((job) => {
      if (!firstNonFilteredJob && !job.isExcludedByTitleFilter) {
        firstNonFilteredJob = job;
      }

      const jobComponent = new JobItem(job, {
        // A job is collapsed if it's marked as low-priority/filtered (default state),
        // This state is now solely determined by the appState's collapsedJobIds set.
        isCollapsed: appState.getCollapsedJobIds().has(job.id),
        onToggle: handleJobToggle,
        onDelete: handleJobDelete,
        onSelect: handleJobSelect,
      });

      appState.setJobComponent(job.id, jobComponent);
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
    setupIntersectionObserver(
      Array.from(appState.getJobComponents().values()).map((c) => c.element)
    );
  }

  /**
   * Initializes the UI with data from the already-loaded AppState.
   * This is called once after the initial state load.
   */
  function initializeUIFromState() {
    console.log('Popup: Initializing UI from state.');
    const state = appState.getState();

    searchFormComponent.setQuery(state.currentUserQuery);
    updatePopupTitleLink(state.currentUserQuery);
    displayRecentJobs();

    statusHeaderComponent.update({
      statusText: appState.getMonitorStatus(),
      lastCheckTimestamp: appState.getLastCheckTimestamp(),
      deletedJobsCount: appState.getDeletedJobsCount(),
    });
    // Initial renders are now handled by subscribers, but we can call them
    updateThemeUI();
  }
  // Callback for SearchForm component when a query is submitted
  async function handleSearchSubmit(query) {
    // The SearchForm component itself handles the alert for empty queries.
    // This function handles the valid query submission.
    appState.setCurrentUserQuery(query); // Update AppState, which handles persistence
    updatePopupTitleLink(query); // Update title link
    console.log('Popup: Query saved:', query);

    // Update the state, which will trigger the UI update via the subscriber.
    appState.updateMonitorStatus('Checking...');
    try {
      const response = await apiService.triggerCheck(query);
      console.log('Popup: Manual check message sent, background responded:', response);
    } catch (error) {
      console.error('Popup: Error sending manual check message:', error.message);
      appState.loadFromStorage(); // Attempt to refresh with current state on error
    }
  }

  manualCheckButton.addEventListener('click', () => {
    const queryToUse = searchFormComponent.getQuery() || config.DEFAULT_USER_QUERY; // Get query from component
    updatePopupTitleLink(queryToUse); // Update title link
    handleSearchSubmit(queryToUse); // Reuse the same logic as the search button
  });

  themeToggleButton.addEventListener('click', () => {
    const currentTheme = appState.getTheme();
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    appState.setTheme(newTheme);
  });

  // Listen for messages from background script to update the display
  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updatePopupDisplay') {
      console.log('Popup: Received updatePopupDisplay message from background. Refreshing data.');
      // Reload state from storage. This will trigger all necessary UI updates
      // via the subscribers, ensuring a consistent, state-driven refresh.
      appState.loadFromStorage();
      if (sendResponse) {
        sendResponse({ status: 'Popup display refreshed.' });
      }
      return true;
    }
  });

  // --- AppState Subscribers ---
  // Centralized setup for all reactive UI updates.
  appState.subscribeToSelector('theme', updateThemeUI); // For theme changes
  appState.subscribeToSelector('selectedJobId', updateJobSelectionUI); // For job selection highlighting (in job list)
  appState.subscribeToSelector('deletedJobIds', () => {
    // For job deletion
    // This is a combined listener for deletedJobIds, as it affects both status header and job list display.
    statusHeaderComponent.update({ deletedJobsCount: appState.getDeletedJobIds().size }); // Update header for deleted count
    displayRecentJobs();
  });
  // When the master job list is updated (e.g., from a background refresh)
  appState.subscribeToSelector('jobs', displayRecentJobs);
  // For status header text changes
  appState.subscribeToSelector('monitorStatus', (newStatus) => {
    statusHeaderComponent.update({ statusText: newStatus });
  });
  // For job item collapsing/expanding
  appState.subscribeToSelector('collapsedJobIds', displayRecentJobs);
  appState.subscribeToSelector('lastCheckTimestamp', (newTimestamp) => {
    statusHeaderComponent.update({ lastCheckTimestamp: newTimestamp });
  });

  // --- IntersectionObserver for Pre-fetching Job Details for Tooltips ---
  let jobItemObserver = null;
  function setupIntersectionObserver(elementsToObserve = []) {
    if (jobItemObserver) {
      jobItemObserver.disconnect(); // Disconnect previous observer if any
    }

    if (elementsToObserve.length === 0) {
      return;
    }

    const observerOptions = {
      root: recentJobsListDiv, // Observe within the scrollable job list container
      rootMargin: '0px',
      threshold: 0.1, // Trigger when 10% of the item is visible
    };

    jobItemObserver = new IntersectionObserver(async (entries, _observer) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const jobItem = entry.target;
          const jobCiphertext = jobItem.dataset.ciphertextForTooltip;
          if (jobCiphertext && !appState.getCachedJobDetails(jobCiphertext)) {
            console.log(`Popup (Observer): Pre-fetching details for visible job ${jobCiphertext}`);
            try {
              await apiService.fetchJobDetailsWithCache(jobCiphertext);
            } catch (_err) {
              /* silent fail */
            }
          }
        }
      }
    }, observerOptions);

    // Observe existing and future .job-item elements
    elementsToObserve.forEach((item) => {
      if (item && item.dataset.ciphertextForTooltip) {
        jobItemObserver.observe(item);
      }
    });
  }

  // Initialize StatusHeader component
  if (typeof StatusHeader === 'undefined') {
    console.error(
      'Initialization Error: StatusHeader class is not defined. Please ensure popup/components/StatusHeader.js is loaded correctly and without errors.'
    );
    if (consolidatedStatusEl) {
      consolidatedStatusEl.innerHTML =
        '<p class="app-header__status-tag app-header__status-tag--error">Error: Status component missing.</p>';
    }
    return; // Stop further execution if a critical component is missing
  }
  statusHeaderComponent = new StatusHeader(consolidatedStatusEl);

  // Initialize JobDetails component
  // This must be initialized before any calls to updateDetailsPanel or handleJobSelect
  // as these functions directly interact with jobDetailsComponent.
  if (typeof JobDetails === 'undefined') {
    console.error(
      'Initialization Error: JobDetails class is not defined. Please ensure popup/components/JobDetails.js is loaded correctly and without errors.'
    );
    if (jobDetailsPanelEl) {
      jobDetailsPanelEl.innerHTML =
        '<p class="details-panel__error">Initialization failed: Job details component missing. Try reloading the extension.</p>';
    }
    return; // Stop further execution if a critical component is missing
  }
  jobDetailsComponent = new JobDetails(jobDetailsPanelEl);

  // Initialize SearchForm component
  if (typeof SearchForm === 'undefined') {
    console.error(
      'Initialization Error: SearchForm class is not defined. Please ensure popup/components/SearchForm.js is loaded correctly and without errors.'
    );
    const querySectionEl = document.querySelector('.query-section');
    if (querySectionEl) {
      querySectionEl.innerHTML =
        '<p class="query-section__error">Initialization failed: Search form component missing.</p>';
    }
    return; // Stop further execution if a critical component is missing
  }
  searchFormComponent = new SearchForm(
    document.querySelector('.query-section'),
    handleSearchSubmit
  );

  // Initialize ApiService
  apiService = new ApiService(appState);

  // Initialize JobDetails component
  if (typeof JobDetails === 'undefined') {
    console.error(
      'Initialization Error: JobDetails class is not defined. Please ensure popup/components/JobDetails.js is loaded correctly and without errors.'
    );
    if (jobDetailsPanelEl) {
      jobDetailsPanelEl.innerHTML =
        '<p class="details-panel__error">Initialization failed: Job details component missing. Try reloading the extension.</p>';
    }
    return; // Stop further execution if a critical component is missing
  }
  initializeUIFromState(); // Initial UI setup from loaded state

  // Initialize UI enhancements like scroll hints (now a global function from utils.js)
  initializeScrollHints(jobListContainerEl, recentJobsListDiv);
});

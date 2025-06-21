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

  // This DEFAULT_QUERY is used if no query is in storage.
  // For the link to match the service-worker's DEFAULT_USER_QUERY initially (if no user query is set),
  // ensure this string is identical to DEFAULT_USER_QUERY in service-worker.js.
  // Use config.DEFAULT_USER_QUERY as the fallback if storage is empty
  let collapsedJobIds = new Set(); // In-memory store for collapsed job IDs, loaded from storage (via StorageManager)
  let deletedJobIds = new Set(); // In-memory store for explicitly deleted job IDs (via StorageManager)
  let currentlySelectedJobId = null; // Keep track of the currently selected job ID
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
    if (!jobDetailsPanelEl) return;
    jobDetailsPanelEl.innerHTML = '<div class="details-panel__loading">Loading details...</div>'; // Show loading indicator
    
    setSelectedJobItem(jobCiphertext); // Highlight the item in the list

    try {
      const details = await fetchJobDetailsWithCache(jobCiphertext);
      const clone = jobDetailsTemplate.content.cloneNode(true);

      // --- Helper function to populate a field and hide its section if no data ---
      const populate = (sectionName, fieldName, content, isHtml = false) => {
        const section = clone.querySelector(`[data-section="${sectionName}"]`);
        const field = clone.querySelector(`[data-field="${fieldName}"]`);
        if (section && field) {
          if (content !== null && content !== undefined && String(content).trim() !== '') {
            if (isHtml) field.innerHTML = content; else field.textContent = content;
            section.style.display = '';
          } else {
            section.style.display = 'none';
          }
        }
      };

      // --- Populate Client Info ---
      const clientStats = details.buyer?.info?.stats || {};
      populate('client-info', 'client-jobs-posted', `Jobs: ${clientStats.totalAssignments || 0}`);
      populate('client-info', 'client-hours', clientStats.hoursCount > 0 ? `${Math.round(clientStats.hoursCount).toLocaleString()}h total` : null);
      populate('client-info', 'client-feedback-count', clientStats.feedbackCount > 0 ? `Feedback: ${clientStats.feedbackCount}` : null);

      // --- Populate Job Activity ---
      const clientActivity = details.opening?.job?.clientActivity || {};
      let lastActivityText = null;
      if (clientActivity.lastBuyerActivity) {
        const lastActivityDate = new Date(clientActivity.lastBuyerActivity);
        const fullTimestamp = `${lastActivityDate.toLocaleDateString()} ${lastActivityDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
        lastActivityText = `<span title="${fullTimestamp}">${timeAgo(lastActivityDate)}</span>`;
      }
      populate('job-activity', 'activity-applicants', `Applicants: ${clientActivity.totalApplicants || 0}`);
      populate('job-activity', 'activity-interviews', `Interviews: ${clientActivity.totalInvitedToInterview || 0}`);
      populate('job-activity', 'activity-hired', `Hired: ${clientActivity.totalHired || 0}/${clientActivity.numberOfPositionsToHire || 1}`);
      populate('job-activity', 'activity-last-active', lastActivityText, true);

      // --- Populate Bid Stats ---
      const bidStats = details.applicantsBidsStats || {};
      const avgBid = bidStats.avgRateBid?.amount;
      const minBid = bidStats.minRateBid?.amount;
      const maxBid = bidStats.maxRateBid?.amount;
      if (avgBid || minBid || maxBid) {
        populate('bid-stats', 'bid-avg', `Avg: $${(avgBid || 0).toFixed(1)}`);
        populate('bid-stats', 'bid-range', `Range: $${minBid || 0} - $${maxBid || 0}`);
      } else {
        const bidSection = clone.querySelector('[data-section="bid-stats"]');
        if (bidSection) bidSection.style.display = 'none';
      }

      // --- Populate Screening Questions ---
      const questions = details.opening?.questions || [];
      const questionsSection = clone.querySelector('[data-section="questions"]');
      if (questions.length > 0) {
        const list = clone.querySelector('[data-field="questions-list"]');
        questions.forEach(q => {
          const li = document.createElement('li');
          li.textContent = q.question;
          list.appendChild(li);
        });
        questionsSection.style.display = '';
      } else {
        questionsSection.style.display = 'none';
      }

      // --- Populate Description ---
      const jobDescription = details.opening?.job?.description;
      if (jobDescription && jobDescription.trim().length > 0) {
        const cleanDescription = jobDescription
          .replace(/<\/?[^>]+(>|$)/g, "") // Remove HTML tags
          .trim();
        populate('description', 'description-content', cleanDescription.replace(/\n/g, '<br>'), true);
      } else {
        const descSection = clone.querySelector('[data-section="description"]');
        if (descSection) descSection.style.display = 'none';
      }

      // Replace panel content with the populated template
      jobDetailsPanelEl.innerHTML = '';
      jobDetailsPanelEl.appendChild(clone);

    } catch (error) {
      jobDetailsPanelEl.innerHTML = `
        <p class="details-panel__error">Failed to load job details: ${error.message}. Please try again later.</p>
      `;
    }
  }

  function createJobItemElement(job, isInitiallyCollapsed) {
    const clone = jobItemTemplate.content.cloneNode(true);
    const jobItemElement = clone.querySelector('.job-item');

    let budgetDisplay = 'N/A';
    if (job.budget) {
      const { type, minAmount, maxAmount, currencyCode } = job.budget;
      if (type && type.toLowerCase().includes('hourly')) {
        const min = parseFloat(minAmount);
        const max = parseFloat(maxAmount);
        if (!isNaN(min) && !isNaN(max) && min < max) {
          budgetDisplay = `$${Math.round(min)} - $${Math.round(max)}/hr`;
        } else if (!isNaN(min)) {
          budgetDisplay = `$${Math.round(min)}/hr`;
        }
      } else { // fixed price
        const amount = parseFloat(minAmount);
        if (!isNaN(amount)) {
          budgetDisplay = `$${Math.round(amount)}`;
        }
      }
    }
    clone.querySelector('[data-field="budget"]').textContent = budgetDisplay;

    // Use helper function for client info
    clone.querySelector('[data-field="client-info"]').innerHTML = formatClientInfo(job.client);

    // Use helper function for skills
    const skillsDisplay = formatSkills(job.skills);
    const skillsElement = clone.querySelector('[data-field="skills"]');
    if (skillsDisplay) {
      skillsElement.textContent = skillsDisplay;
    } else {
      skillsElement.parentElement.style.display = 'none'; // Hide the whole <p> tag
    }
    const titleContainer = clone.querySelector('.job-item__title-container');
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

    if (priorityTagHTML) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = priorityTagHTML;
      titleContainer.prepend(tempDiv.firstElementChild);
    }
    if (appliedIconHTML) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = appliedIconHTML;
      titleContainer.prepend(tempDiv.firstElementChild);
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
    // Add client-based modifiers directly from job object, as formatClientInfo doesn't return them
    if (job.client && parseFloat(job.client.rating) >= 4.9) jobItemModifiers.push('job-item--high-rating');
    if (job.client && job.client.totalSpent != null && Number(job.client.totalSpent) > 10000) jobItemModifiers.push('job-item--high-spent');


    jobItemElement.classList.add(...jobItemModifiers);
    jobItemElement.dataset.jobId = job.id;
    jobItemElement.dataset.ciphertextForTooltip = job.ciphertext || job.id; // For IntersectionObserver

    clone.querySelector('.job-item__toggle').textContent = isInitiallyCollapsed ? '+' : '-';

    const titleLink = clone.querySelector('.job-item__title');
    const jobUrl = `https://www.upwork.com/jobs/${job.ciphertext || job.id}`;
    titleLink.href = jobUrl;
    titleLink.dataset.ciphertext = job.ciphertext || job.id;
    titleLink.textContent = job.title || 'No Title';

    const postedOnDate = job.postedOn ? new Date(job.postedOn) : null;
    if (postedOnDate) {
      clone.querySelector('[data-field="posted-on"]').textContent = `${postedOnDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}, ${postedOnDate.toLocaleDateString()}`;
      clone.querySelector('[data-field="time-ago"]').textContent = timeAgo(postedOnDate);
    }

    return jobItemElement;
  }

  /**
   * Updates an existing job item DOM element with new data.
   * This is more efficient than re-creating the element for minor state changes.
   * @param {HTMLElement} element The existing job item DOM element.
   * @param {object} job The job data object.
   * @param {boolean} isCollapsed Whether the job item should be collapsed.
   */
  function updateJobItemElement(element, job, isCollapsed) {
    // 1. Update state-based classes
    element.classList.toggle('job-item--collapsed', isCollapsed);
    element.classList.toggle('job-item--low-priority', job.isLowPriorityBySkill || job.isLowPriorityByClientCountry);
    element.classList.toggle('job-item--excluded', job.isExcludedByTitleFilter);
    element.classList.toggle('job-item--applied', job.applied);
    element.classList.toggle('job-item--high-rating', job.client && parseFloat(job.client.rating) >= 4.9);

    const toggleButton = element.querySelector('.job-item__toggle');
    if (toggleButton) {
      toggleButton.textContent = isCollapsed ? '+' : '-';
    }

    // 2. Update Header Icons & Tags (remove old, add new to prevent duplication)
    const titleContainer = element.querySelector('.job-item__title-container');
    if (titleContainer) {
        titleContainer.querySelectorAll('.job-item__applied-icon, .job-item__priority-tag').forEach(el => el.remove());

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

        if (priorityTagHTML) titleContainer.insertAdjacentHTML('afterbegin', priorityTagHTML);
        if (appliedIconHTML) titleContainer.insertAdjacentHTML('afterbegin', appliedIconHTML);
    }

    // 3. Update Details Section
    const budgetEl = element.querySelector('[data-field="budget"]');
    if (budgetEl) {
      let budgetDisplay = 'N/A';
      if (job.budget) {
        const { type, minAmount, maxAmount, currencyCode } = job.budget;
        if (type && type.toLowerCase().includes('hourly')) {
          const min = parseFloat(minAmount);
          const max = parseFloat(maxAmount);
          if (!isNaN(min) && !isNaN(max) && min < max) {
            budgetDisplay = `$${Math.round(min)} - $${Math.round(max)}/hr`;
          } else if (!isNaN(min)) {
            budgetDisplay = `$${Math.round(min)}/hr`;
          }
        } else { // fixed price
          const amount = parseFloat(minAmount);
          if (!isNaN(amount)) {
            budgetDisplay = `$${Math.round(amount)}`;
          }
        }
      }
      budgetEl.textContent = budgetDisplay;
    }

    // Use helper function for client info
    const clientInfoEl = element.querySelector('[data-field="client-info"]');
    if (clientInfoEl) {
        clientInfoEl.innerHTML = formatClientInfo(job.client);
    }

    // Use helper function for skills
    const skillsEl = element.querySelector('[data-field="skills"]');
    if (skillsEl) {
        const skillsDisplay = formatSkills(job.skills);
        skillsEl.textContent = skillsDisplay;
        skillsEl.parentElement.style.display = skillsDisplay ? '' : 'none';
    }

    const postedOnEl = element.querySelector('[data-field="posted-on"]');
    const timeAgoEl = element.querySelector('[data-field="time-ago"]');
    if (postedOnEl && timeAgoEl) {
        const postedOnDate = job.postedOn ? new Date(job.postedOn) : null;
        postedOnEl.textContent = postedOnDate ? `${postedOnDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}, ${postedOnDate.toLocaleDateString()}` : 'N/A';
        timeAgoEl.textContent = postedOnDate ? timeAgo(postedOnDate) : 'N/A';
    }
  }

  function displayRecentJobs(jobs = []) {
    console.log("Popup: displayRecentJobs called with:", jobs);

    const jobsToDisplay = jobs.filter(job => job && job.id && !deletedJobIds.has(job.id));

    if (jobsToDisplay.length === 0) {
      recentJobsListDiv.innerHTML = '<p class="job-list__no-jobs">No new jobs found.</p>';
      mainContentArea.classList.add('empty-list');
      if (jobDetailsPanelEl) jobDetailsPanelEl.innerHTML = '<p class="details-panel__no-jobs">No jobs to display.</p>';
      currentlySelectedJobId = null;
      setupIntersectionObserver([]);
      return;
    }

    mainContentArea.classList.remove('empty-list');

    const existingJobElements = new Map();
    Array.from(recentJobsListDiv.children).forEach(child => {
      if (child.dataset && child.dataset.jobId) {
        existingJobElements.set(child.dataset.jobId, child);
      }
    });

    const fragment = document.createDocumentFragment();
    let firstNonFilteredJob = null;
    const newJobElements = [];

    jobsToDisplay.forEach(job => {
      if (!firstNonFilteredJob && !job.isExcludedByTitleFilter) {
        firstNonFilteredJob = job;
      }

      const isCollapsed = collapsedJobIds.has(job.id);
      let jobItemElement = existingJobElements.get(job.id);

      if (jobItemElement) {
        updateJobItemElement(jobItemElement, job, isCollapsed);
        existingJobElements.delete(job.id);
      } else {
        jobItemElement = createJobItemElement(job, isCollapsed);
      }
      fragment.appendChild(jobItemElement);
      newJobElements.push(jobItemElement);
    });

    existingJobElements.forEach(element => element.remove());

    recentJobsListDiv.replaceChildren(fragment);

    if (firstNonFilteredJob && firstNonFilteredJob.id) {
      updateDetailsPanel(firstNonFilteredJob.id);
    } else if (jobDetailsPanelEl) {
      jobDetailsPanelEl.innerHTML = '<p class="details-panel__no-jobs">No job selected.</p>';
      setSelectedJobItem(null);
    }

    setupIntersectionObserver(newJobElements);
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

  // Add a listener for storage changes to keep the popup data up-to-date
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      const changedKeys = Object.keys(changes);

      // If the only change was the UI theme, we don't need a full reload.
      // The theme is handled directly by its own click handler, and reloading
      // here would cause a feedback loop.
      if (changedKeys.length === 1 && changedKeys[0] === StorageManager.STORAGE_KEYS.UI_THEME) {
        console.log("Popup: UI theme changed, no data reload needed.");
        return; // Exit without reloading
      }

      // For any other data change, or multiple changes, reload the data.
      console.log("Popup: Storage changed, reloading data. Changes:", changes);
      loadStoredData();
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
        if (jobDetailsPanelEl) jobDetailsPanelEl.innerHTML = '<p class="details-panel__no-jobs">Job removed. Select another job to see details.</p>';
        currentlySelectedJobId = null;
      }

      StorageManager.getRecentFoundJobs().then(currentRecentJobs => {
        StorageManager.setRecentFoundJobs(currentRecentJobs.filter(item => item.id !== jobId));
      });
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
    document.querySelectorAll('#recentJobsList .job-item').forEach(item => {
        if (item.dataset.jobCiphertextForTooltip) jobItemObserver.observe(item);
    });
  }


  // The MutationObserver is no longer needed as displayRecentJobs now explicitly calls setupIntersectionObserver.

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

  loadStoredData(); // Initial load

  // Initialize UI enhancements like scroll hints
  UJM_UI.initializeScrollHints(jobListContainerEl, recentJobsListDiv);
});

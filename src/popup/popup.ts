import { AppState } from './state/AppState.js';
import { Runtime } from 'webextension-polyfill';
import { ApiService } from './services/ApiService.js';
import { JobDetails } from './components/JobDetails.js';
import { JobItem } from './components/JobItem.js';
import { SearchForm } from './components/SearchForm.js';
import { StatusHeader } from './components/StatusHeader.js';
import { config } from '../background/config.js';
import { $, constructUpworkSearchURL, initializeScrollHints } from '../utils/utils.js';
import { Job } from '../types.js';

let jobItemObserver: IntersectionObserver | null = null; // fixes no-misused-promises lint error

document.addEventListener('DOMContentLoaded', () => {
  console.log('Popup: DOMContentLoaded event fired.');
  const popupTitleLinkEl = $<HTMLAnchorElement>('.app-header__title');
  const consolidatedStatusEl = $<HTMLElement>('.app-header__status');
  const manualCheckButton = $<HTMLButtonElement>('.app-header__button');
  const themeToggleButton = document.getElementById('theme-toggle-button') as HTMLButtonElement;
  const mainContentArea = $<HTMLElement>('.main-content');
  const jobListContainerEl = $<HTMLElement>('.job-list-container');
  const recentJobsListDiv = $<HTMLElement>('.job-list');
  const jobDetailsPanelEl = $<HTMLElement>('.details-panel');
  const themeStylesheet = document.getElementById('theme-stylesheet') as HTMLLinkElement;

  const appState = new AppState();
  console.log('Popup: AppState instance created.');
  void appState.loadFromStorage(); // fixes no-floating-promises lint error
  console.log('Popup: AppState loaded from storage.');

  const statusHeaderComponent = new StatusHeader(consolidatedStatusEl);
  const jobDetailsComponent = new JobDetails(jobDetailsPanelEl);
  const searchFormComponent = new SearchForm(
    $<HTMLElement>('.query-section'),
    (query) => void handleSearchSubmit(query)
  );
  const apiService = new ApiService(appState);

  initializeUIFromState();
  console.log('Popup: initializeUIFromState called.');

  function updatePopupTitleLink(currentQuery: string): void {
    if (popupTitleLinkEl) {
      const url = constructUpworkSearchURL(
        currentQuery,
        [...config.DEFAULT_CONTRACTOR_TIERS_GQL],
        config.DEFAULT_SORT_CRITERIA
      );
      popupTitleLinkEl.href = url;
    }
  }

  function updateThemeUI(): void {
    const theme = appState.getTheme();
    if (!themeStylesheet || !themeToggleButton) {
      return;
    }

    if (theme === 'dark') {
      themeStylesheet.href = 'popup-dark.css';
      themeToggleButton.textContent = '☀️';
      themeToggleButton.title = 'Switch to Light Mode';
    } else {
      themeStylesheet.href = 'popup.css';
      themeToggleButton.textContent = '🌙';
      themeToggleButton.title = 'Switch to Dark Mode';
    }
  }

  function setSelectedJobItem(jobId: string | null): void {
    appState.setSelectedJobId(jobId);
  }

  function updateJobSelectionUI(newJobId: string | null, oldJobId: string | null): void {
    if (oldJobId) {
      const prevSelectedElement = recentJobsListDiv.querySelector(
        `.job-item[data-job-id="${oldJobId}"]`
      );
      if (prevSelectedElement) {
        prevSelectedElement.classList.remove('job-item--selected');
      }
    }

    if (newJobId) {
      const newSelectedElement = recentJobsListDiv.querySelector(
        `.job-item[data-job-id="${newJobId}"]`
      );
      if (newSelectedElement) {
        newSelectedElement.classList.add('job-item--selected');
      }
    }
  }

  async function updateDetailsPanel(jobCiphertext: string): Promise<void> {
    if (!jobDetailsComponent) {
      return;
    }
    jobDetailsComponent.showLoading();

    setSelectedJobItem(jobCiphertext);

    try {
      const details = await apiService.fetchJobDetailsWithCache(jobCiphertext);
      jobDetailsComponent.render(details);
    } catch (error) {
      jobDetailsComponent.showError(error);
    }
  }

  function handleJobToggle(jobId: string, _isNowCollapsed: boolean): void {
    appState.toggleJobCollapse(jobId);
  }

  function handleJobDelete(jobId: string): void {
    appState.deleteJob(jobId);
  }

  function handleJobSelect(jobCiphertext: string): void {
    if (jobCiphertext !== appState.getSelectedJobId()) {
      void updateDetailsPanel(jobCiphertext);
    }
  }

  function displayRecentJobs(): void {
    console.log('Popup: displayRecentJobs called.');
    const jobsToDisplay = appState.getVisibleJobs();

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

    appState.clearJobComponents();
    const fragment = document.createDocumentFragment();
    let firstNonFilteredJob: Job | null = null;

    for (const job of jobsToDisplay) {
      if (!firstNonFilteredJob && !job.isExcludedByTitleFilter) {
        firstNonFilteredJob = job;
      }

      const jobComponent = new JobItem(job, {
        isCollapsed: appState.getCollapsedJobIds().has(job.id),
        onToggle: handleJobToggle,
        onDelete: handleJobDelete,
        onSelect: handleJobSelect,
      });

      appState.setJobComponent(job.id, jobComponent);
      fragment.appendChild(jobComponent.render());
    }

    recentJobsListDiv.replaceChildren(fragment);

    if (firstNonFilteredJob) {
      handleJobSelect(firstNonFilteredJob.id);
    } else {
      jobDetailsComponent.showInitialMessage('No job selected.');
      setSelectedJobItem(null);
    }

    setupIntersectionObserver(
      Array.from(appState.getJobComponents().values())
        .map((c) => c.element) // c.element can be null after destroy() is called
        .filter((el): el is HTMLElement => el !== null)
    );
  }

  function initializeUIFromState(): void {
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
    updateThemeUI();
  }

  async function handleSearchSubmit(query: string): Promise<void> {
    appState.setCurrentUserQuery(query);
    updatePopupTitleLink(query);
    console.log('Popup: Query saved:', query);

    appState.updateMonitorStatus('Checking...');
    try {
      const response = await apiService.triggerCheck(query);
      console.log('Popup: Manual check message sent, background responded:', response);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'An unknown error occurred';
      console.error('Popup: Error sending manual check message:', message);
      void appState.loadFromStorage();
    }
  }

  manualCheckButton.addEventListener('click', () => {
    const queryToUse = searchFormComponent.getQuery() || config.DEFAULT_USER_QUERY;
    updatePopupTitleLink(queryToUse);
    void handleSearchSubmit(queryToUse);
  });

  themeToggleButton.addEventListener('click', () => {
    const currentTheme = appState.getTheme();
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    appState.setTheme(newTheme);
  });

  // This listener does not send a response, so it can be async directly.
  // The void here handles the floating promise warning.
  browser.runtime.onMessage.addListener(async (request: unknown, _sender: Runtime.MessageSender): Promise<void> => {
    if (
      request &&
      typeof request === 'object' &&
      'action' in request &&
      request.action === 'updatePopupDisplay'
    ) {
      console.log('Popup: Received updatePopupDisplay message from background. Refreshing data.');
      await appState.loadFromStorage();
    }
  });

  function setupIntersectionObserver(elementsToObserve: HTMLElement[] = []): void {
    if (jobItemObserver) {
      jobItemObserver.disconnect(); // fixes no-misused-promises lint error
      jobItemObserver = null; // Explicitly set to null after disconnecting
    }

    if (elementsToObserve.length === 0) {
      return;
    }

    const observerOptions: IntersectionObserverInit = {
      root: recentJobsListDiv,
      rootMargin: '0px',
      threshold: 0.1,
    };

    jobItemObserver = new IntersectionObserver((entries, _observer) => {
      void (async () => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const jobItem = entry.target as HTMLElement;
            const jobCiphertext = jobItem.dataset.ciphertextForTooltip;
            if (jobCiphertext && !appState.getCachedJobDetails(jobCiphertext)) {
              console.log(`Popup (Observer): Pre-fetching details for visible job ${jobCiphertext}`);
              try {
                await apiService.fetchJobDetailsWithCache(jobCiphertext);
              } catch (_err: unknown) {
                // Pre-fetching is a best-effort optimization.
                // We can ignore errors here as the user can still click to fetch manually.
              }
            }
          }
        }
      })();
    }, observerOptions);

    elementsToObserve.forEach((item) => {
      if (item.dataset.ciphertextForTooltip) {
        jobItemObserver?.observe(item);
      }
    });
  }

  initializeScrollHints(jobListContainerEl, recentJobsListDiv);

  appState.subscribeToSelector('theme', () => { updateThemeUI(); });
  appState.subscribeToSelector('selectedJobId', (newId, oldId) => { updateJobSelectionUI(newId, oldId); });
  appState.subscribeToSelector('deletedJobIds', () => {
    statusHeaderComponent.update({ deletedJobsCount: appState.getDeletedJobIds().size });
    displayRecentJobs();
  });
  appState.subscribeToSelector('jobs', () => { displayRecentJobs(); });
  appState.subscribeToSelector('monitorStatus', (newStatus: string) => {
    statusHeaderComponent.update({ statusText: newStatus }); // fixes no-misused-promises lint error
  });
  appState.subscribeToSelector('collapsedJobIds', () => { displayRecentJobs(); });
  appState.subscribeToSelector('lastCheckTimestamp', (newTimestamp: number | null) => {
    statusHeaderComponent.update({ lastCheckTimestamp: newTimestamp });
  });
});
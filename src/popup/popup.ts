import { AppState } from './state/AppState.js';
import { Runtime } from 'webextension-polyfill';
declare const browser: typeof import('webextension-polyfill');
import { ApiService } from './services/ApiService.js';
import { JobDetails } from './components/JobDetails.js';
import { JobItem } from './components/JobItem.js';
import { SearchForm } from './components/SearchForm.js';
import { StatusHeader } from './components/StatusHeader.js';
import { config } from '../background/config.js';
import { constructUpworkSearchURL, initializeScrollHints } from '../utils.js';
import { Tier, Job } from '../types.js';

let jobItemObserver: IntersectionObserver | null = null;

document.addEventListener('DOMContentLoaded', async () => {
  console.log('Popup: DOMContentLoaded event fired.');
  const popupTitleLinkEl = document.querySelector('.app-header__title') as HTMLAnchorElement;
  const consolidatedStatusEl = document.querySelector('.app-header__status') as HTMLElement;
  const manualCheckButton = document.querySelector('.app-header__button') as HTMLButtonElement;
  const themeToggleButton = document.getElementById('theme-toggle-button') as HTMLButtonElement;
  const mainContentArea = document.querySelector('.main-content') as HTMLElement;
  const jobListContainerEl = document.querySelector('.job-list-container') as HTMLElement;
  const recentJobsListDiv = document.querySelector('.job-list') as HTMLElement;
  const jobDetailsPanelEl = document.querySelector('.details-panel') as HTMLElement;
  const themeStylesheet = document.getElementById('theme-stylesheet') as HTMLLinkElement;

  const appState = new AppState();
  console.log('Popup: AppState instance created.');
  await appState.loadFromStorage();
  console.log('Popup: AppState loaded from storage.');

  let statusHeaderComponent = new StatusHeader(consolidatedStatusEl);
  let jobDetailsComponent = new JobDetails(jobDetailsPanelEl);
  let searchFormComponent = new SearchForm(
    document.querySelector('.query-section') as HTMLElement,
    handleSearchSubmit
  );
  let apiService = new ApiService(appState);

  initializeUIFromState();
  console.log('Popup: initializeUIFromState called.');

  function updatePopupTitleLink(currentQuery: string): void {
    if (popupTitleLinkEl) {
      const url = constructUpworkSearchURL(
        currentQuery,
        config.DEFAULT_CONTRACTOR_TIERS_GQL as Tier[],
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
      updateDetailsPanel(jobCiphertext);
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
      Array.from(appState.getJobComponents().values()).map((c) => c.element)
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
    } catch (error: any) {
      console.error('Popup: Error sending manual check message:', error.message);
      appState.loadFromStorage();
    }
  }

  manualCheckButton.addEventListener('click', () => {
    const queryToUse = searchFormComponent.getQuery() || config.DEFAULT_USER_QUERY;
    updatePopupTitleLink(queryToUse);
    handleSearchSubmit(queryToUse);
  });

  themeToggleButton.addEventListener('click', () => {
    const currentTheme = appState.getTheme();
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    appState.setTheme(newTheme);
  });

  browser.runtime.onMessage.addListener((request: any, sender: Runtime.MessageSender, sendResponse: (response?: any) => void): true => {
    if (request.action === 'updatePopupDisplay') {
      console.log('Popup: Received updatePopupDisplay message from background. Refreshing data.');
      appState.loadFromStorage();
      if (sendResponse) {
        sendResponse({ status: 'Popup display refreshed.' });
      }
      return true;
    }
    return true; // Ensure a boolean is always returned
  });

  function setupIntersectionObserver(elementsToObserve: HTMLElement[] = []): void {
    if (jobItemObserver) {
      jobItemObserver.disconnect();
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

    jobItemObserver = new IntersectionObserver(async (entries: IntersectionObserverEntry[], _observer: IntersectionObserver) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const jobItem = entry.target as HTMLElement;
          const jobCiphertext = jobItem.dataset.ciphertextForTooltip;
          if (jobCiphertext && !appState.getCachedJobDetails(jobCiphertext)) {
            console.log(`Popup (Observer): Pre-fetching details for visible job ${jobCiphertext}`);
            try {
              await apiService.fetchJobDetailsWithCache(jobCiphertext);
            } catch (_err: any) {
            }
          }
        }
      }
    }, observerOptions);

    if (jobItemObserver) { // Added check
      elementsToObserve.forEach((item) => {
        if (item && item.dataset.ciphertextForTooltip) {
          jobItemObserver!.observe(item);
        }
      });
    }
  }

  initializeScrollHints(jobListContainerEl, recentJobsListDiv);

  appState.subscribeToSelector('theme', updateThemeUI);
  appState.subscribeToSelector('selectedJobId', updateJobSelectionUI);
  appState.subscribeToSelector('deletedJobIds', () => {
    statusHeaderComponent.update({ deletedJobsCount: appState.getDeletedJobIds().size });
    displayRecentJobs();
  });
  appState.subscribeToSelector('jobs', displayRecentJobs);
  appState.subscribeToSelector('monitorStatus', (newStatus: string) => {
    statusHeaderComponent.update({ statusText: newStatus });
  });
  appState.subscribeToSelector('collapsedJobIds', displayRecentJobs);
  appState.subscribeToSelector('lastCheckTimestamp', (newTimestamp: number | null) => {
    statusHeaderComponent.update({ lastCheckTimestamp: newTimestamp });
  });
});
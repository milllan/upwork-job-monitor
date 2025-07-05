import { Job, JobDetails, TalentProfile, isGraphQLResponse, GraphQLResponse } from '../types.js';

declare const browser: any;
import { config } from '../background/config.js';
import { StorageManager } from '../storage/storage-manager.js';
import { UpworkAPI } from '../api/upwork-api.js';
import { AudioService } from './audio-service.js';
import { formatBudget } from '../utils.js';

let isJobCheckRunning = false; // Flag to prevent concurrent runs

/**
 * Applies exclusion and low-priority filters to a list of jobs based on title, skills, and client country.
 *
 * Jobs are flagged as excluded if their title matches any configured exclusion string, and as low priority if their skills or client country match configured low-priority terms.
 *
 * @param jobs - The array of jobs to filter and annotate
 * @returns An object containing the processed jobs with filter flags and counts for each filter category
 */
function _applyClientSideFilters(jobs: Job[]): {
  processedJobs: Job[];
  titleExcludedCount: number;
  skillLowPriorityCount: number;
  clientCountryLowPriorityCount: number;
} {
  let titleExcludedCount = 0;
  let skillLowPriorityCount = 0;
  let clientCountryLowPriorityCount = 0;

  const processedJobs = jobs.map((job) => {
    const newJobData: any = {
      ...job,
      isExcludedByTitleFilter: false,
      isLowPriorityBySkill: false,
      isLowPriorityByClientCountry: false,
    };

    // 1. Apply TITLE based exclusion
    const titleLower = (job.title || '').toLowerCase(); // Ensure title is lowercase for comparison
    if (
      config.TITLE_EXCLUSION_STRINGS.length > 0 &&
      config.TITLE_EXCLUSION_STRINGS.some((excludeString: string) =>
        titleLower.includes(excludeString)
      )
    ) {
      newJobData.isExcludedByTitleFilter = true;
      titleExcludedCount++;
    }

    // 2. Apply SKILL based low-priority marking
    if (
      Array.isArray(job.skills) &&
      job.skills.length > 0 &&
      config.SKILL_LOW_PRIORITY_TERMS.length > 0
    ) {
      for (const skill of job.skills) {
        if (
          skill &&
          skill.name &&
          config.SKILL_LOW_PRIORITY_TERMS.includes(skill.name.toLowerCase())
        ) {
          newJobData.isLowPriorityBySkill = true;
          skillLowPriorityCount++;
          break; // Found a matching low-priority skill, no need to check further for this job
        }
      }
    }

    // 3. Apply CLIENT COUNTRY based low-priority marking
    if (job.client && job.client.country && config.CLIENT_COUNTRY_LOW_PRIORITY.length > 0) {
      if (config.CLIENT_COUNTRY_LOW_PRIORITY.includes(job.client.country.toLowerCase())) {
        newJobData.isLowPriorityByClientCountry = true;
        clientCountryLowPriorityCount++;
      }
    }
    return newJobData;
  });

  return {
    processedJobs,
    titleExcludedCount,
    skillLowPriorityCount,
    clientCountryLowPriorityCount,
  };
}

/**
 * Identifies new and notifiable jobs from the fetched list, updates seen and collapsed job IDs, and sends notifications for eligible jobs.
 *
 * Filters out jobs that have already been seen or deleted, determines which jobs are new and notifiable (not excluded or low priority), marks new jobs as seen, updates the set of collapsed job IDs for low-priority or excluded jobs, and sends notifications for notifiable jobs.
 *
 * @param fetchedJobs - Jobs fetched from the API, already processed by client-side filters
 * @param historicalSeenJobIds - Set of job IDs that have been seen previously
 * @param deletedJobIds - Set of job IDs deleted by the user
 * @param currentCollapsedJobIds - Current set of collapsed job IDs
 * @returns An object containing the count of all new or updated jobs, the count of notifiable new jobs, and the updated set of collapsed job IDs
 */
async function _processAndNotifyNewJobs(
  fetchedJobs: Job[],
  historicalSeenJobIds: Set<string>,
  deletedJobIds: Set<string>,
  currentCollapsedJobIds: Set<string>
): Promise<{
  allNewOrUpdatedJobsCount: number;
  notifiableNewJobsCount: number;
  updatedCollapsedJobIds: Set<string>;
}> {
  // Filter out jobs that are already seen OR have been explicitly deleted by the user from the *fetched* list
  const allNewOrUpdatedJobs = fetchedJobs.filter(
    (job) => job && job.id && !historicalSeenJobIds.has(job.id) && !deletedJobIds.has(job.id)
  );
  // From these, determine which are truly new AND notifiable (not excluded by title filter)
  const notifiableNewJobs = allNewOrUpdatedJobs.filter(
    (job: Job) =>
      !job.isExcludedByTitleFilter &&
      !job.isLowPriorityBySkill &&
      !job.isLowPriorityByClientCountry &&
      job.applied !== true
  );
  const newJobIdsToMarkSeen: string[] = [];
  fetchedJobs.forEach((job: Job) => {
    if (job && job.id && !historicalSeenJobIds.has(job.id)) {
      newJobIdsToMarkSeen.push(job.id);
      // If it's a new, low-priority job OR a new "Filtered" (excluded by title) job,
      // add to collapsedJobIds so it starts collapsed in the popup.
      if (
        (job.isLowPriorityBySkill ||
          job.isLowPriorityByClientCountry ||
          job.isExcludedByTitleFilter) &&
        !currentCollapsedJobIds.has(job.id)
      ) {
        currentCollapsedJobIds.add(job.id);
      }
    }
  });
  await StorageManager.addSeenJobIds(newJobIdsToMarkSeen);
  if (notifiableNewJobs.length > 0) {
    notifiableNewJobs.forEach((job) => sendNotification(job));
  }
  return {
    allNewOrUpdatedJobsCount: allNewOrUpdatedJobs.length,
    notifiableNewJobsCount: notifiableNewJobs.length,
    updatedCollapsedJobIds: currentCollapsedJobIds,
  };
}

// Helper to send message to popup if open
async function _sendPopupUpdateMessage() {
  try {
    const popupViews = browser.extension.getViews({ type: 'popup' });
    if (popupViews && popupViews.length > 0) {
      await browser.runtime.sendMessage({ action: 'updatePopupDisplay' });
    } else {
      console.log('MV2: Popup not open, skipping updatePopupDisplay message.');
    }
  } catch (e) {
    console.warn('MV2: Error during conditional send of updatePopupDisplay message:', e);
  }
}

// --- Storage Update Helper ---
/**
 * Updates storage with the latest job check results, including monitor status, new job count, last check timestamp, recent jobs (excluding deleted ones), and collapsed job IDs.
 *
 * @param notifiableNewJobsCount - The number of new, notifiable jobs found in the latest check.
 * @param fetchedJobs - The list of jobs fetched from the API after client-side filtering.
 * @param updatedCollapsedJobIds - The set of collapsed job IDs to be stored.
 * @param deletedJobIds - The set of job IDs that have been deleted by the user.
 */
async function _updateStorageAfterCheck(
  notifiableNewJobsCount: number,
  fetchedJobs: Job[],
  updatedCollapsedJobIds: Set<string>,
  deletedJobIds: Set<string>
) {
  await StorageManager.setMonitorStatus(`Checked. New (notifiable): ${notifiableNewJobsCount}`);
  await StorageManager.setNewJobsInLastRun(notifiableNewJobsCount);
  await StorageManager.setLastCheckTimestamp(Date.now());
  // Filter out deleted jobs before storing recent jobs
  const jobsToStore = fetchedJobs
    ? fetchedJobs.filter((job) => job && job.id && !deletedJobIds.has(job.id))
    : [];
  await StorageManager.setRecentFoundJobs(jobsToStore);
  await StorageManager.setCollapsedJobIds(Array.from(updatedCollapsedJobIds)); // Save updated collapsed IDs
}

// --- MODIFIED Helper Function for Smart Error Handling ---
/**
 * Handles API authentication failures and other API errors, updating monitor status and triggering user recovery actions when needed.
 *
 * If an authentication-related error is detected (such as missing tokens, permission errors, or specific HTTP status codes), updates the monitor status and attempts to open a relevant Upwork page in a new browser tab to prompt user re-authentication. For other API errors, updates the monitor status with a generic error message. Notifies the extension popup of the status change.
 *
 * @param errorResult - The error object returned from the API call
 * @param context - The context of the API call ('jobSearch', 'jobDetails', or 'talentProfile')
 * @param options - Optional context-specific options, such as a ciphertext ID for details or profile recovery URLs
 */
async function _handleApiTokenFailure(
  errorResult: any,
  context: string,
  options: { ciphertext?: string } = {}
) {
  // An auth failure is now defined as: no tokens found, a permissions-based GraphQL error, or specific HTTP errors.
  const isAuthFailure =
    errorResult.type === 'auth' ||
    errorResult.type === 'graphql' || // A GraphQL error often indicates a permissions issue with the token.
    (errorResult.type === 'http' && // Or an HTTP error that indicates auth issues
      [401, 403, 429].includes(errorResult.details?.status)); // 401 Unauthorized, 403 Forbidden, 429 Too Many Requests

  if (isAuthFailure) {
    await StorageManager.setMonitorStatus('Authentication failed. Please log in to Upwork.');
    let recoveryUrl = config.UPWORK_DOMAIN;

    // Build context-specific recovery URL
    switch (context) {
      case 'jobSearch':
        recoveryUrl = `${config.UPWORK_DOMAIN}/nx/find-work/`;
        break;
      case 'jobDetails':
        if (options.ciphertext) {
          recoveryUrl = `${config.UPWORK_DOMAIN}/jobs/${options.ciphertext}`;
        }
        break;
      case 'talentProfile':
        if (options.ciphertext) {
          recoveryUrl = `${config.UPWORK_DOMAIN}/freelancers/${options.ciphertext}`;
        }
        break;
    }

    try {
      await browser.tabs.create({ url: recoveryUrl });
    } catch (e) {
      console.warn(`MV2: Error trying to open recovery tab for ${context}:`, e);
    }
  } else {
    // For other errors (network, parsing, server errors), just update the status.
    const errorMessage = `API Error: ${errorResult.type || 'Unknown'}. Check console.`;
    await StorageManager.setMonitorStatus(errorMessage);
  }

  // Notify the popup that the state has changed
  await _sendPopupUpdateMessage();
}

/**
 * Executes a single Upwork job check cycle, including fetching jobs, applying client-side filters, processing notifications, and updating storage.
 *
 * @param triggeredByUserQuery - An optional user-specified search query to override the default or stored query.
 */
async function _performJobCheckLogic(triggeredByUserQuery?: string) {
  console.log('MV2: Attempting runJobCheck (Direct Background with token loop)...');
  await StorageManager.setMonitorStatus('Checking...');

  const userQueryToUse =
    triggeredByUserQuery ||
    (await StorageManager.getCurrentUserQuery()) ||
    config.DEFAULT_USER_QUERY;

  const apiResult = await UpworkAPI.fetchJobs(userQueryToUse);

  if (isGraphQLResponse(apiResult)) {
    console.error('MV2: Failed to fetch jobs after trying all tokens.', apiResult);
    await _handleApiTokenFailure(apiResult, 'jobSearch', {});
    return;
  }

  // If we reach here, the API call was successful.
  let fetchedJobs: Job[] = (apiResult as { jobs: Job[] }).jobs;

  // Apply client-side title exclusion and skill-based low-priority marking
  if (fetchedJobs && fetchedJobs.length > 0) {
    const originalJobCount = fetchedJobs.length;
    const processedJobsResult = _applyClientSideFilters(fetchedJobs);
    fetchedJobs = processedJobsResult.processedJobs;
    console.log(
      `MV2: Processed ${originalJobCount} jobs. Marked ${processedJobsResult.titleExcludedCount} as excluded by title. Marked ${processedJobsResult.skillLowPriorityCount} as low-priority by skill. Marked ${processedJobsResult.clientCountryLowPriorityCount} as low-priority by client country.`
    );
  }

  // Deduplication, Notification, and Collapsed ID Management
  const historicalSeenJobIds = await StorageManager.getSeenJobIds();
  const deletedJobIds = await StorageManager.getDeletedJobIds();
  const currentCollapsedJobIds = await StorageManager.getCollapsedJobIds();

  const processResult = await _processAndNotifyNewJobs(
    fetchedJobs,
    historicalSeenJobIds,
    deletedJobIds,
    currentCollapsedJobIds
  );

  console.log(
    `MV2 DirectBG: Token Loop. Found ${processResult.allNewOrUpdatedJobsCount} new/updated jobs, ${processResult.notifiableNewJobsCount} are notifiable.`
  );

  // Update storage
  await _updateStorageAfterCheck(
    processResult.notifiableNewJobsCount,
    fetchedJobs,
    processResult.updatedCollapsedJobIds,
    deletedJobIds
  );

  // Send message to popup
  await _sendPopupUpdateMessage();
}

/**
 * Initiates a job check if one is not already running, handling concurrency and unexpected errors.
 *
 * @param triggeredByUserQuery - An optional user-provided query to override the default job search.
 */
async function runJobCheck(triggeredByUserQuery?: string) {
  if (isJobCheckRunning) {
    console.log('MV2: runJobCheck - Job check already in progress. Skipping this run.');
    await StorageManager.setMonitorStatus('Busy, check in progress...');
    return;
  }
  isJobCheckRunning = true;

  try {
    // Delegate the core logic to the new helper function
    await _performJobCheckLogic(triggeredByUserQuery);
  } catch (error: any) {
    // Catch any unexpected errors from the logic function
    console.error('MV2: An unexpected error occurred during the job check process:', error);
    await StorageManager.setMonitorStatus('Error. Check console.');
    await _sendPopupUpdateMessage(); // Notify popup of the error status
  } finally {
    isJobCheckRunning = false;
    console.log('MV2: runJobCheck finished. isJobCheckRunning set to false.');
  }
}

// --- Initial Setup and Alarm Creation ---
// Initialize storage and set up alarms on install/update

browser.runtime.onInstalled.addListener(async (details: any) => {
  // Made async
  console.log('MV2: Extension installed or updated:', details.reason);
  await StorageManager.initializeStorage(config.DEFAULT_USER_QUERY);
  await setupAlarms(); // Always set up alarms on install/update
});

/**
 * Ensures that a periodic alarm for job fetching is set up, creating it if it does not already exist.
 *
 * Uses configuration values for the alarm name and interval.
 */
async function setupAlarms() {
  // Made async
  try {
    const alarm = await browser.alarms.get(config.FETCH_ALARM_NAME); // Use config.FETCH_ALARM_NAME
    if (!alarm) {
      await browser.alarms.create(config.FETCH_ALARM_NAME, {
        delayInMinutes: 0.2,
        periodInMinutes: config.FETCH_INTERVAL_MINUTES,
      }); // Use config for interval too
    }
  } catch (e) {
    console.error('MV2: Error setting up alarm:', e);
  }
}
browser.alarms.onAlarm.addListener(async (alarm: any) => {
  if (alarm.name === config.FETCH_ALARM_NAME) {
    // Use config.FETCH_ALARM_NAME
    await runJobCheck();
  }
});

/**
 * Displays a browser notification for a new Upwork job and plays a notification sound.
 *
 * The notification includes the job title and budget if available.
 */
async function sendNotification(job: Job) {
  // Made async
  const jobUrl = `https://www.upwork.com/jobs/${job.ciphertext || job.id}`;
  // Use formatBudget from utils.js for budget formatting
  const budgetString = formatBudget(job.budget);
  const notificationOptions = {
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: 'New Upwork Job!',
    message:
      budgetString && budgetString !== 'N/A' ? `${job.title}\nBudget: ${budgetString}` : job.title,
    priority: 2,
  };
  try {
    await browser.notifications.create(jobUrl, notificationOptions);
    // Play notification sound using the persistent audio element
    // The call is now cleaner and abstracted
    AudioService.playSound();
  } catch (e) {
    console.error('MV2: Error creating notification:', e);
  }
}

browser.notifications.onClicked.addListener(async (notificationId: string) => {
  // Made async
  try {
    await browser.tabs.create({ url: notificationId });
    await browser.notifications.clear(notificationId);
  } catch (e) {
    console.error('MV2: Error handling notification click:', e);
  }
});

/**
 * Handles a manual job check request from the extension popup.
 *
 * Sets the current user query based on the request or default configuration, initiates a job check, and returns a status message.
 *
 * @returns An object indicating that the manual check has been initiated.
 */

async function _handleManualCheck(request: any) {
  const queryFromPopup = request.userQuery || config.DEFAULT_USER_QUERY;
  await StorageManager.setCurrentUserQuery(queryFromPopup);
  await runJobCheck(queryFromPopup); // This now has the smart error handler
  return { status: 'Manual check initiated and processing.' };
}

/**
 * Handles a request to retrieve job details by validating input and delegating to the job details fetcher.
 *
 * @returns The job details object or a GraphQL error response.
 */
async function _handleGetJobDetails(request: any) {
  if (!request.jobCiphertext) {
    throw new Error('jobCiphertext is required for getJobDetails action.');
  }
  return await _fetchAndProcessJobDetails(request.jobCiphertext);
}

/**
 * Handles requests to retrieve a talent profile by validating input and fetching profile details.
 *
 * @returns The talent profile details or an error response if retrieval fails.
 */
async function _handleGetTalentProfile(request: any) {
  if (!request.profileCiphertext) {
    throw new Error('profileCiphertext is required for getTalentProfile action.');
  }
  return await _fetchAndProcessTalentProfile(request.profileCiphertext);
}

const messageHandlers: { [key: string]: (request: any) => Promise<any> } = {
  manualCheck: _handleManualCheck,
  getJobDetails: _handleGetJobDetails,
  getTalentProfile: _handleGetTalentProfile, // ADDED
};

browser.runtime.onMessage.addListener(async (request: any, _sender: any) => {
  const handler = messageHandlers[request.action];
  if (handler) {
    try {
      // Await the handler and return its result directly.
      // This correctly propagates the successful data or the error object.
      return await handler(request);
    } catch (error: any) {
      console.error(
        `Background: Error handling action "${request.action}":`,
        error.message,
        error.stack
      );
      return { error: true, message: `Error during ${request.action}: ${error.message}` };
    }
  } else if (request.action) {
    console.warn(`MV2: No message handler found for action: ${request.action}`);
  }
});

/**
 * Fetches detailed information for a job using its ciphertext, handling API errors and authentication failures.
 *
 * If the API returns an authentication error (HTTP 403), triggers token recovery logic. Returns either the job details or a GraphQL error response.
 *
 * @param jobCiphertext - The encrypted identifier for the job to fetch details for
 * @returns An object containing the job details, or a GraphQL error response if the fetch fails
 */
async function _fetchAndProcessJobDetails(jobCiphertext: string): Promise<{ jobDetails: JobDetails | null } | GraphQLResponse<any>> {
  const apiResult = await UpworkAPI.fetchJobDetails(jobCiphertext);

  if (isGraphQLResponse(apiResult)) {
    console.error('MV2: Failed to fetch job details.', apiResult);
    // Handle the specific 403 case for token failures
    if (apiResult.type === 'http' && apiResult.details.status === 403) {
      await _handleApiTokenFailure(apiResult, 'jobDetails', { ciphertext: jobCiphertext });
    }
    // For all other errors, just return the GraphQL error response
    return apiResult;
  }

  // On success, apiResult is { jobDetails: JobDetails | null }.
  // We need to handle the null case explicitly.
  if ('jobDetails' in apiResult && apiResult.jobDetails === null) {
    console.log(`MV2: Job details for ${jobCiphertext} not found (returned null).`);
  }

  return apiResult;
}

/**
 * Fetches and processes a talent profile from the Upwork API using the provided ciphertext.
 *
 * If the API response indicates an authentication failure, triggers token recovery handling.
 * Returns the talent profile details or a GraphQL error response.
 *
 * @param profileCiphertext - The encrypted identifier for the talent profile to fetch.
 * @returns An object containing the talent profile details, or a GraphQL error response if the fetch fails.
 */
async function _fetchAndProcessTalentProfile(
  profileCiphertext: string
): Promise<{ profileDetails: TalentProfile | null } | GraphQLResponse<any>> {
  const apiResult = await UpworkAPI.fetchTalentProfile(profileCiphertext);

  if (isGraphQLResponse(apiResult)) {
    console.error('MV2: Failed to fetch talent profile.', apiResult);
    if (apiResult.type === 'http' && apiResult.details.status === 403) {
      await _handleApiTokenFailure(apiResult, 'talentProfile', { ciphertext: profileCiphertext });
    }
    return apiResult;
  }

  // Handle the null case for talent profiles
  if ('profileDetails' in apiResult && apiResult.profileDetails === null) {
    console.log(`MV2: Talent profile for ${profileCiphertext} not found (returned null).`);
  }

  return apiResult;
}

setupAlarms();
// Defer the initial run to ensure all modules are loaded and initialized,
// preventing a race condition where UpworkAPI might not be defined yet.
setTimeout(() => runJobCheck(), 0);

export { runJobCheck };

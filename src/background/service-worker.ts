import { Job, JobDetails, TalentProfile, isGraphQLResponse, GraphQLResponse, ProcessedJob } from '../types.js';
import { type Notifications, type Runtime } from 'webextension-polyfill';

// Use declare to inform TypeScript about the global 'browser' object provided by the extension environment.

import { config } from '../background/config.js';
import { StorageManager } from '../storage/storage-manager.js';
import { UpworkAPI } from '../api/upwork-api.js';
import { AudioService } from './audio-service.js';
import { formatBudget } from '../utils.js';

let isJobCheckRunning = false; // Flag to prevent concurrent runs

/**
 * Applies client-side filtering rules (title exclusion, skill/country low-priority)
 * to a list of jobs.
 * @param {Array<Object>} jobs - The array of job objects to process.
 * @returns {Object} An object containing the processed jobs and counts of filtered jobs.
 */
function _applyClientSideFilters(jobs: Job[]): {
  processedJobs: ProcessedJob[];
  titleExcludedCount: number;
  skillLowPriorityCount: number;
  clientCountryLowPriorityCount: number;
} {
  let titleExcludedCount = 0;
  let skillLowPriorityCount = 0;
  let clientCountryLowPriorityCount = 0;

  const processedJobs = jobs.map((job): ProcessedJob => {
    const newJobData: ProcessedJob = {
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
          skill?.name &&
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
 * Processes fetched jobs for deduplication, updates seen/collapsed IDs, and sends notifications.
 * @param {Array<Object>} fetchedJobs - The jobs fetched from the API, already processed by client-side filters.
 * @param {Set<string>} historicalSeenJobIds - Set of job IDs seen historically.
 * @param {Set<string>} deletedJobIds - Set of job IDs deleted by the user.
 * @param {Set<string>} currentCollapsedJobIds - Current set of collapsed job IDs.
 * @returns {Promise<Object>} An object containing counts of new/notifiable jobs and the updated collapsed job IDs.
 */
async function _processAndNotifyNewJobs(
  fetchedJobs: ProcessedJob[],
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
    (job) => job?.id && !historicalSeenJobIds.has(job.id) && !deletedJobIds.has(job.id)
  );
  // From these, determine which are truly new AND notifiable (not excluded by title filter)
  const notifiableNewJobs = allNewOrUpdatedJobs.filter(
    (job: ProcessedJob) =>
      !job.isExcludedByTitleFilter &&
      !job.isLowPriorityBySkill &&
      !job.isLowPriorityByClientCountry &&
      job.applied !== true
  );
  const newJobIdsToMarkSeen: string[] = [];
  fetchedJobs.forEach((job: ProcessedJob) => {
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
 * Updates various storage items after a job check.
 * @param {number} notifiableNewJobsCount - Number of new, notifiable jobs found.
 * @param {Array<Object>} fetchedJobs - All jobs fetched from the API (after client-side filtering).
 * @param {Set<string>} updatedCollapsedJobIds - The set of collapsed job IDs, including newly collapsed ones.
 * @param {Set<string>} deletedJobIds - The set of job IDs deleted by the user.
 */
async function _updateStorageAfterCheck(
  notifiableNewJobsCount: number,
  fetchedJobs: ProcessedJob[],
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
 * Handles API failures, providing specific user feedback and actions.
 * Opens a relevant Upwork tab ONLY on authentication-related errors (HTTP 403).
 * @param {object} errorResult - The error object from the API call.
 * @param {string} context - The context of the API call ('jobSearch', 'jobDetails', 'talentProfile').
 * @param {object} [options={}] - Context-specific options.
 * @param {string} [options.ciphertext] - The ciphertext ID for details/profile calls.
 */
async function _handleApiTokenFailure(
  errorResult: GraphQLResponse<unknown> | { type: string; details?: { status?: number } },
  context: 'jobSearch' | 'jobDetails' | 'talentProfile',
  options: { ciphertext?: string } = {}
) {
  // An auth failure is now defined as: no tokens found, a permissions-based GraphQL error, or specific HTTP errors.
  const isAuthFailure =
    errorResult.type === 'auth' ||
    errorResult.type === 'graphql' || // A GraphQL error often indicates a permissions issue with the token.
    (errorResult.type === 'http' &&
      [401, 403, 429].includes(errorResult.details?.status as number)); // 401 Unauthorized, 403 Forbidden, 429 Too Many Requests

  if (isAuthFailure) {
    await StorageManager.setMonitorStatus('Authentication failed. Please log in to Upwork.');
    let recoveryUrl: string = config.UPWORK_DOMAIN;

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
 * Contains the core logic for a single job check run.
 * This function is called by the `runJobCheck` orchestrator.
 * @param {string} triggeredByUserQuery - A specific query from a user action, or null/undefined.
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
  const initialJobs: Job[] = apiResult.jobs;
  let processedJobs: ProcessedJob[] = [];

  // Apply client-side title exclusion and skill-based low-priority marking
  if (initialJobs && initialJobs.length > 0) {
    const originalJobCount = initialJobs.length;
    const processedJobsResult = _applyClientSideFilters(initialJobs);
    processedJobs = processedJobsResult.processedJobs;
    console.log(
      `MV2: Processed ${originalJobCount} jobs. Marked ${processedJobsResult.titleExcludedCount} as excluded by title. Marked ${processedJobsResult.skillLowPriorityCount} as low-priority by skill. Marked ${processedJobsResult.clientCountryLowPriorityCount} as low-priority by client country.`
    );
  }

  // Deduplication, Notification, and Collapsed ID Management
  const historicalSeenJobIds = await StorageManager.getSeenJobIds();
  const deletedJobIds = await StorageManager.getDeletedJobIds();
  const currentCollapsedJobIds = await StorageManager.getCollapsedJobIds();

  const processResult = await _processAndNotifyNewJobs(
    processedJobs,
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
    processedJobs,
    processResult.updatedCollapsedJobIds,
    deletedJobIds
  );

  // Send message to popup
  await _sendPopupUpdateMessage();
}

/**
 * Orchestrates the job checking process, ensuring it doesn't run concurrently.
 * This function acts as a gatekeeper and error handler for the core logic.
 * @param {string} triggeredByUserQuery - A query from a user action, if any.
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
  } catch (error: unknown) {
    // Catch any unexpected errors from the logic function
    console.error(
      'MV2: An unexpected error occurred during the job check process:',
      error instanceof Error ? error.message : error
    );
    await StorageManager.setMonitorStatus('Error. Check console.');
    await _sendPopupUpdateMessage(); // Notify popup of the error status
  } finally {
    isJobCheckRunning = false;
    console.log('MV2: runJobCheck finished. isJobCheckRunning set to false.');
  }
}

// --- Initial Setup and Alarm Creation ---
// Initialize storage and set up alarms on install/update

browser.runtime.onInstalled.addListener(async (details) => {
  // Made async
  console.log('MV2: Extension installed or updated:', details.reason);
  await StorageManager.initializeStorage(config.DEFAULT_USER_QUERY);
  await setupAlarms(); // Always set up alarms on install/update
});

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
browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === config.FETCH_ALARM_NAME) {
    // Use config.FETCH_ALARM_NAME
    await runJobCheck();
  }
});

async function sendNotification(job: Job) {
  // Made async
  const jobUrl = `https://www.upwork.com/jobs/${job.ciphertext || job.id}`;
  // Use formatBudget from utils.js for budget formatting
  const budgetString = formatBudget(job.budget);
  const notificationOptions: Notifications.CreateNotificationOptions = {
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

// --- MODIFIED Message Handlers ---

interface ManualCheckRequest {
  action: 'manualCheck';
  userQuery?: string;
}
async function _handleManualCheck(request: ManualCheckRequest) {
  const queryFromPopup = request.userQuery || config.DEFAULT_USER_QUERY;
  await StorageManager.setCurrentUserQuery(queryFromPopup);
  await runJobCheck(queryFromPopup); // This now has the smart error handler
  return { status: 'Manual check initiated and processing.' };
}

interface GetJobDetailsRequest {
  action: 'getJobDetails';
  jobCiphertext?: string;
}
// MODIFIED: This function now just calls the processing function
async function _handleGetJobDetails(request: GetJobDetailsRequest) {
  if (!request.jobCiphertext) {
    throw new Error('jobCiphertext is required for getJobDetails action.');
  }
  return await _fetchAndProcessJobDetails(request.jobCiphertext);
}

interface GetTalentProfileRequest {
  action: 'getTalentProfile';
  profileCiphertext?: string;
}
// NEW: Handler for talent profile requests
async function _handleGetTalentProfile(request: GetTalentProfileRequest) {
  if (!request.profileCiphertext) {
    throw new Error('profileCiphertext is required for getTalentProfile action.');
  }
  return await _fetchAndProcessTalentProfile(request.profileCiphertext);
}

type MessageRequest = ManualCheckRequest | GetJobDetailsRequest | GetTalentProfileRequest;

browser.runtime.onMessage.addListener(async (request: unknown, _sender: Runtime.MessageSender) => {
  if (!request || typeof request !== 'object' || !('action' in request)) {
    console.warn('Invalid message format received');
    return;
  }
  const message = request as MessageRequest;
  try {
    switch (message.action) {
      case 'manualCheck':
        return await _handleManualCheck(message);

      case 'getJobDetails':
        return await _handleGetJobDetails(message);

      case 'getTalentProfile':
        return await _handleGetTalentProfile(message);

      default: {
        // This will cause a TypeScript error if any action is not handled, ensuring exhaustiveness.
        const _exhaustiveCheck: never = message;
        console.warn(`MV2: No message handler found for action:`, _exhaustiveCheck);
        return;
      }
    }
  } catch (error: unknown) {
    const err = error as Error;
    const action = (message as { action?: string }).action || 'unknown';
    console.error(`Background: Error handling action "${action}":`, err.message, err.stack);
    return { error: true, message: `Error during ${action}: ${err.message}` };
  }
});

// MODIFIED: This now contains the smart error handling logic
async function _fetchAndProcessJobDetails(
  jobCiphertext: string
): Promise<GraphQLResponse<{ jobDetails: JobDetails | null }>> {
  const apiResult = await UpworkAPI.fetchJobDetails(jobCiphertext);

  if (isGraphQLResponse(apiResult)) {
    console.error('MV2: Failed to fetch job details.', apiResult);
    // Handle the specific 403 case for token failures
    if (apiResult.type === 'http' && apiResult.details && apiResult.details.status === 403) {
      await _handleApiTokenFailure(apiResult, 'jobDetails', { ciphertext: jobCiphertext });
    }
    // For all other errors, just return the GraphQL error response
    return apiResult as GraphQLResponse<{ jobDetails: JobDetails | null }>;
  }

  // On success, apiResult is { jobDetails: JobDetails | null }.
  // We need to handle the null case explicitly.
  if ('jobDetails' in apiResult && apiResult.jobDetails === null) {
    console.log(`MV2: Job details for ${jobCiphertext} not found (returned null).`);
  }

  return { data: apiResult };
}

// NEW: Processing function for talent profiles
async function _fetchAndProcessTalentProfile(
  profileCiphertext: string
): Promise<GraphQLResponse<{ profileDetails: TalentProfile | null }>> {
  const apiResult = await UpworkAPI.fetchTalentProfile(profileCiphertext);

  if (isGraphQLResponse(apiResult)) {
    console.error('MV2: Failed to fetch talent profile.', apiResult);
    if (apiResult.type === 'http' && apiResult.details && apiResult.details.status === 403) {
      await _handleApiTokenFailure(apiResult, 'talentProfile', { ciphertext: profileCiphertext });
    }
    return apiResult as GraphQLResponse<{ profileDetails: TalentProfile | null }>;
  }

  // Handle the null case for talent profiles
  if ('profileDetails' in apiResult && apiResult.profileDetails === null) {
    console.log(`MV2: Talent profile for ${profileCiphertext} not found (returned null).`);
  }

  return { data: apiResult };
}

setupAlarms();
// Defer the initial run to ensure all modules are loaded and initialized,
// preventing a race condition where UpworkAPI might not be defined yet.
setTimeout(() => runJobCheck(), 0);

export { runJobCheck };

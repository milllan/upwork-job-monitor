import { JobDetails, GraphQLResponse } from '../../types.js';
import { AppState } from '../state/AppState.js';

type GetJobDetailsResponse = GraphQLResponse<{ jobDetails: JobDetails | null }>;

interface TriggerCheckResponse {
  status: string;
}

class ApiService {
  private appState: AppState;

  constructor(appState: AppState) {
    if (!appState) {
      throw new Error('ApiService requires an AppState instance.');
    }
    this.appState = appState;
  }

  /**
   * Fetches job details, utilizing the AppState cache.
   * @param {string} jobCiphertext - The ciphertext ID of the job.
   * @returns {Promise<Object>} The job details data.
   */
  async fetchJobDetailsWithCache(jobCiphertext: string): Promise<JobDetails | null> {
    const cachedData = this.appState.getCachedJobDetails(jobCiphertext);
    if (cachedData) {
      console.log(`ApiService: Using cached job details for ${jobCiphertext}`);
      return cachedData;
    }

    console.log(`ApiService: Fetching fresh job details for ${jobCiphertext}`);
    const response: GetJobDetailsResponse = await browser.runtime.sendMessage({
      action: 'getJobDetails',
      jobCiphertext: jobCiphertext,
    });

    if (response && response.data && typeof response.data.jobDetails !== 'undefined') {
      if (response.data.jobDetails) {
        this.appState.setCachedJobDetails(jobCiphertext, response.data.jobDetails);
      }
      return response.data.jobDetails;
    } else {
      console.error(
        'ApiService: Failed to get job details from background:',
        response?.details || response
      );
      throw new Error(
        typeof response?.details?.message === 'string'
          ? response.details.message
          : 'An unknown error occurred in the background script.'
      );
    }
  }

  /**
   * Sends a message to the background script to trigger a manual job check.
   * @param {string} queryToUse - The search query to use for the check.
   * @returns {Promise<Object>} The response from the background script.
   */
  async triggerCheck(queryToUse: string): Promise<TriggerCheckResponse> {
    console.log('ApiService: Triggering check with query:', queryToUse);
    return browser.runtime.sendMessage({ action: 'manualCheck', userQuery: queryToUse });
  }
}

export { ApiService };

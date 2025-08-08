import { JobDetails } from '../../types.js';
import { AppState } from '../state/AppState.js';

interface TriggerCheckResponse {
  status: string;
}

class ApiService {
  private appState: AppState;

  constructor(appState: AppState) {
    // appState is a required dependency; rely on typing and caller contract
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
    try {
      // Explicit return type to satisfy analyzer; browser runtime returns unknown-typed payload
      const response = await browser.runtime.sendMessage({
        action: 'getJobDetails',
        jobCiphertext: jobCiphertext,
      });

      const payload = response as { jobDetails: JobDetails | null };
      if (payload.jobDetails) {
        this.appState.setCachedJobDetails(jobCiphertext, payload.jobDetails);
      }
      return payload.jobDetails;
    } catch (error) {
      console.error('ApiService: Failed to get job details from background:', error);
      throw error; // Re-throw the error to be handled by the UI
    }
  }

  /**
   * Sends a message to the background script to trigger a manual job check.
   * @param {string} queryToUse - The search query to use for the check.
   * @returns {Promise<Object>} The response from the background script.
   */
  async triggerCheck(queryToUse: string): Promise<TriggerCheckResponse> {
    console.log('ApiService: Triggering check with query:', queryToUse);
    // Explicit type for message response to avoid unnecessary assertion warnings
    const resp = await browser.runtime.sendMessage({
      action: 'manualCheck',
      userQuery: queryToUse,
    });
    return resp as TriggerCheckResponse;
  }
}

export { ApiService };

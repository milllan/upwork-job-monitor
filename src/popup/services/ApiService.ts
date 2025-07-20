import { JobDetails } from '../../types.js';
import { AppState } from '../state/AppState.js';

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
    try {
      const response = (await browser.runtime.sendMessage({
        action: 'getJobDetails',
        jobCiphertext: jobCiphertext,
      })) as { jobDetails: JobDetails | null };

      if (response && typeof response.jobDetails !== 'undefined') {
        if (response.jobDetails) {
          this.appState.setCachedJobDetails(jobCiphertext, response.jobDetails);
        }
        return response.jobDetails;
      } else {
        // This case should ideally not be reached if the background script always returns a value or throws.
        throw new Error('Invalid response from background script.');
      }
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
    return browser.runtime.sendMessage({ action: 'manualCheck', userQuery: queryToUse });
  }
}

export { ApiService };

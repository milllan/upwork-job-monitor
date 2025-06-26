/**
 * ApiService
 * Handles all communication between the popup and the background service worker.
 * This includes fetching job details and triggering manual checks.
 */
class ApiService {
  constructor(appState) {
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
  async fetchJobDetailsWithCache(jobCiphertext) {
    const cachedData = this.appState.getCachedJobDetails(jobCiphertext);
    if (cachedData) {
      console.log(`ApiService: Using cached job details for ${jobCiphertext}`);
      return cachedData;
    }

    console.log(`ApiService: Fetching fresh job details for ${jobCiphertext}`);
    const response = await browser.runtime.sendMessage({
      action: 'getJobDetails',
      jobCiphertext: jobCiphertext,
    });

    if (response && response.jobDetails) {
      this.appState.setCachedJobDetails(jobCiphertext, response.jobDetails);
      return response.jobDetails;
    } else {
      console.error('ApiService: Failed to get job details from background', response?.error);
      throw new Error(response?.error || 'Failed to fetch job details');
    }
  }

  /**
   * Sends a message to the background script to trigger a manual job check.
   * @param {string} queryToUse - The search query to use for the check.
   * @returns {Promise<Object>} The response from the background script.
   */
  async triggerCheck(queryToUse) {
    console.log('ApiService: Triggering check with query:', queryToUse);
    return browser.runtime.sendMessage({ action: 'manualCheck', userQuery: queryToUse });
  }
}

// Export for use in other modules
window.ApiService = ApiService;

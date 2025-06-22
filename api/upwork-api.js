/**
 * Handles all interactions with the Upwork API.
 * This includes token retrieval, GraphQL payload construction, and fetch requests.
 */
console.log("Upwork API module loaded.");

/**
 * Retrieves and prioritizes potential OAuth2 API tokens from cookies.
 * @returns {Promise<string[]>} A promise that resolves with an array of token strings.
 */
async function getAllPotentialApiTokens() {
  try {
    const cookies = await browser.cookies.getAll({ domain: "upwork.com" });
    if (!cookies || cookies.length === 0) {
      console.warn("API: No cookies found for upwork.com domain.");
      return [];
    }

    let allOAuthTokens = [];
    for (const cookie of cookies) {
      if (cookie.value && cookie.value.startsWith("oauth2v2_")) {
        allOAuthTokens.push({ name: cookie.name, value: cookie.value });
      }
    }

    if (allOAuthTokens.length === 0) {
      console.warn("API: No cookies matching 'oauth2v2_' prefix found.");
      return [];
    }

    let candidateTokens = [];

    // 1. Prioritize 'oauth2_global_js_token' as it's often the active one for UI GQL calls
    const globalJsToken = allOAuthTokens.find(t => t.name === "oauth2_global_js_token");
    if (globalJsToken) {
      candidateTokens.push(globalJsToken.value);
    }

    // 2. Add 'sb' pattern tokens next, if different from globalJsToken
    const sbPatternTokens = allOAuthTokens.filter(t =>
      t.name.length === 10 && t.name.endsWith("sb") &&
      t.name !== "forterToken" &&
      (!globalJsToken || t.value !== globalJsToken.value) // Avoid duplicates
    );
    sbPatternTokens.forEach(t => candidateTokens.push(t.value));

    // 3. Add other potential oauth2v2_ tokens, excluding known non-API and already added ones
    const otherPotentials = allOAuthTokens.filter(t =>
      t.value.startsWith("oauth2v2_") && // Ensure it's an oauth2v2 token
      !candidateTokens.includes(t.value) && // Avoid duplicates
      t.name !== "visitor_gql_token" &&
      t.name !== "visitor_innova_gql_token" &&
      !t.name.includes("master_access_token") &&
      !t.name.includes("_vt")
    );
    otherPotentials.forEach(t => candidateTokens.push(t.value));
    // console.log("API: Candidate API tokens (prioritized):", candidateTokens.map(t => t.substring(0,20) + "..."));
    return [...new Set(candidateTokens)]; // Ensure uniqueness
  } catch (error) {
    console.error("API: Error getting all cookies:", error.message);
    return [];
  }
}

/**
 * Fetches Upwork jobs directly using a provided bearer token and user query.
 * @param {string} bearerToken The OAuth2 bearer token.
 * @param {string} userQuery The user's search query string.
 * @returns {Promise<Object[]|Object>} A promise that resolves with an array of job objects on success,
 *                                      or an error object {error: true, ...} on failure.
 */
async function fetchUpworkJobsDirectly(bearerToken, userQuery) {
  // --- START: Temporary block due to persistent permission errors ---
  // console.warn("API: fetchUpworkJobsDirectly - The 'userJobSearchV1' GraphQL endpoint appears to be inaccessible due to token permissions, even for minimal queries. Skipping job search attempt via this method.");
  // return { error: true, message: "Skipping job search: 'userJobSearchV1' endpoint permission issue.", permissionIssue: true };
  // --- END: Temporary block ---

  const endpoint = `${config.UPWORK_GRAPHQL_ENDPOINT_BASE}?alias=userJobSearch`;
  const fullRawQueryString = `
  query UserJobSearch($requestVariables: UserJobSearchV1Request!) {
    search {
      universalSearchNuxt {
        userJobSearchV1(request: $requestVariables) {
          paging { total offset count }
          results {
            id
            title
            description
            relevanceEncoded
            applied
            ontologySkills { uid prefLabel prettyName: prefLabel }
            jobTile { job { id ciphertext: cipherText publishTime createTime jobType hourlyBudgetMin hourlyBudgetMax fixedPriceAmount { amount isoCurrencyCode } } }
            upworkHistoryData { client { paymentVerificationStatus country totalSpent { amount } totalFeedback } }
          }
        }
      }
    }
  }`;

  const variables = {
    requestVariables: {
      userQuery: userQuery || config.DEFAULT_USER_QUERY,
      contractorTier: config.DEFAULT_CONTRACTOR_TIERS_GQL,
      sort: config.DEFAULT_SORT_CRITERIA,
      highlight: false,
      paging: { offset: 0, count: config.API_FETCH_COUNT }, // Use config value
    },
  };
  const graphqlPayload = { query: fullRawQueryString, variables: variables };
  const requestHeadersForFetch = {
    "Authorization": `Bearer ${bearerToken}`,
    "Content-Type": "application/json",
    "Accept": "*/*",
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: requestHeadersForFetch,
      body: JSON.stringify(graphqlPayload),
    });
    if (!response.ok) {
      const responseBodyText = await response.text();
      console.warn(`API: API request failed with token ${bearerToken.substring(0,10)}... Status: ${response.status}`, responseBodyText.substring(0, 300));
      return { error: true, status: response.status, body: responseBodyText.substring(0, 300) };
    }
    const data = await response.json();
    if (data.errors) {
      console.warn(`API: GraphQL API errors with token ${bearerToken.substring(0,10)}...:`, data.errors);
      return { error: true, graphqlErrors: data.errors };
    }
    if (data.data?.search?.universalSearchNuxt?.userJobSearchV1?.results) {
      let jobsData = data.data.search.universalSearchNuxt.userJobSearchV1.results;
      return jobsData.map(job => ({
        id: job.jobTile.job.ciphertext || job.jobTile.job.id, // Prefer ciphertext from jobTile
        ciphertext: job.jobTile.job.ciphertext,
        title: job.title,
        description: job.description,
        postedOn: job.jobTile.job.publishTime || job.jobTile.job.createTime,
        applied: job.applied,
        budget: {
          type: job.jobTile.job.jobType,
          currencyCode: job.jobTile.job.fixedPriceAmount?.isoCurrencyCode || 'USD',
          minAmount: job.jobTile.job.jobType.toLowerCase().includes('hourly') ? job.jobTile.job.hourlyBudgetMin : job.jobTile.job.fixedPriceAmount?.amount,
          maxAmount: job.jobTile.job.jobType.toLowerCase().includes('hourly') ? job.jobTile.job.hourlyBudgetMax : job.jobTile.job.fixedPriceAmount?.amount,
        },
        client: {
          paymentVerificationStatus: job.upworkHistoryData?.client?.paymentVerificationStatus,
          country: job.upworkHistoryData?.client?.country,
          totalSpent: job.upworkHistoryData?.client?.totalSpent?.amount || 0,
          rating: job.upworkHistoryData?.client?.totalFeedback,
        },
        skills: job.ontologySkills ? job.ontologySkills.map(skill => ({ name: skill.prettyName || skill.prefLabel })) : [],
        _fullJobData: job // Keep this for debugging if needed
      }));
    } else { return []; }
  } catch (error) { 
    console.error(`API: Network error with token ${bearerToken.substring(0,10)}...:`, error);
    return { error: true, networkError: error.message };
  }
}

/**
 * Internal helper to manage API calls with sticky token and rotation logic.
 * @param {Function} apiCallFunction The actual API call function (e.g., fetchUpworkJobsDirectly, fetchJobDetails).
 * @param {any[]} params Parameters to pass to the apiCallFunction after the token.
 * @returns {Promise<{result: any, token: string}|{error: true, message: string, details?: any}>}
 *          Resolves with an object containing the API call's result and the successful token,
 *          or an error object if all tokens fail.
 */
async function _executeApiCallWithStickyTokenRotation(apiCallFunction, ...params) {
  const operationName = apiCallFunction.name; // For logging

  // 1. Try with the last known good token
  const lastKnownGoodToken = await StorageManager.getLastKnownGoodToken();
  if (lastKnownGoodToken) {
    // console.log(`API: Trying last known good token ${lastKnownGoodToken.substring(0, 15)}... for ${operationName}`);
    const result = await apiCallFunction(lastKnownGoodToken, ...params);
    if (result && !result.error && !result.permissionIssue) { // Check for permissionIssue as well
      console.log(`API: Successfully used last known good token for ${operationName}.`);
      return { result, token: lastKnownGoodToken };
    } else {
      console.warn(`API: Last known good token failed for ${operationName}. Clearing it and trying full rotation.`);
      await StorageManager.setLastKnownGoodToken(null); // Clear the failing sticky token
    }
  }

  // 2. If no sticky token or it failed, proceed with full rotation
  const candidateTokens = await getAllPotentialApiTokens();
  if (!candidateTokens || candidateTokens.length === 0) {
    console.error(`API: Cannot perform ${operationName}, no candidate tokens found.`);
    return { error: true, message: `No candidate API tokens found for ${operationName}.` };
  }

  for (const token of candidateTokens) {
    // console.log(`API: Trying candidate token ${token.substring(0, 15)}... for ${operationName}`);
    const result = await apiCallFunction(token, ...params);

    if (result && !result.error && !result.permissionIssue) {
      console.log(`API: Successfully fetched with token ${token.substring(0, 15)}... for ${operationName}. Setting as new good token.`);
      await StorageManager.setLastKnownGoodToken(token);
      return { result, token: token };
    } else {
      if (result && result.graphqlErrors) {
        console.warn(`API: GraphQL error with token ${token.substring(0, 15)} for ${operationName} - ${JSON.stringify(result.graphqlErrors)}`);
      } else if (result && result.status) {
        console.warn(`API: HTTP error ${result.status} with token ${token.substring(0, 15)} for ${operationName}`);
      } else if (result && result.networkError) {
        console.warn(`API: Network error with token ${token.substring(0, 15)} for ${operationName}`);
      } else if (result && result.permissionIssue) {
        console.warn(`API: Permission issue with token ${token.substring(0, 15)} for ${operationName}: ${result.message}`);
      }
      // console.log(`API: Token ${token.substring(0, 15)}... failed for ${operationName}. Trying next.`);
    }
  }

  console.error(`API: All candidate tokens failed for ${operationName}.`);
  return { error: true, message: `All candidate tokens failed for ${operationName}.` };
}

/**
 * Fetches Upwork jobs using the sticky token rotation strategy.
 * @param {string} userQuery The user's search query string.
 * @returns {Promise<{jobs: Object[], token: string}|{error: true, message: string, details?: any}>}
 */
async function fetchJobsWithTokenRotation(userQuery) {
  const apiResponse = await _executeApiCallWithStickyTokenRotation(fetchUpworkJobsDirectly, userQuery);
  if (apiResponse.error) return apiResponse; // Propagate error
  return { jobs: apiResponse.result, token: apiResponse.token };
}

/**
 * Fetches detailed job and client information for a specific job.
 * @param {string} bearerToken The OAuth2 bearer token.
 * @param {string} jobCiphertext The job's ciphertext ID from search results.
 * @returns {Promise<Object|Object>} A promise that resolves with the job details object on success,
 *                                   or an error object {error: true, ...} on failure.
 */
async function fetchJobDetails(bearerToken, jobCiphertext) {
  const endpoint = `${config.UPWORK_GRAPHQL_ENDPOINT_BASE}?alias=gql-query-get-auth-job-details`;
  const graphqlQuery = `
  query JobAuthDetailsQuery($id: ID!) {
    jobAuthDetails(id: $id) {
      opening {
        job {
          description
          clientActivity {
            lastBuyerActivity
            totalApplicants
            totalHired
            totalInvitedToInterview
            numberOfPositionsToHire
          }
        }
        questions {
          question # Changed from 'text'
          position
        }
      }
      buyer {
        info {
          stats {
            totalAssignments
            hoursCount
            feedbackCount
            score
            totalCharges {
              amount
            }
          }
        }
        workHistory {
          jobInfo {
            title
          }
          contractorInfo {
            contractorName
            ciphertext
          }
          feedback {
            score
            comment
          }
          feedbackToClient {
            comment
          }
        }
      }
      applicantsBidsStats {
        avgRateBid {
          amount
        }
        minRateBid {
          amount
        }
        maxRateBid {
          amount
        }
      }
    }
  }`;
  
  const variables = {
    id: jobCiphertext,
    // isLoggedIn: true, // Removed as it's unused in the current query structure
    // isFreelancerOrAgency: true // Removed as it's unused
  };
  
  const graphqlPayload = { query: graphqlQuery, variables: variables };
  const requestHeadersForFetch = {
    "Authorization": `Bearer ${bearerToken}`,
    "Content-Type": "application/json",
    "Accept": "*/*",
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: requestHeadersForFetch,
      body: JSON.stringify(graphqlPayload),
    });
    
    if (!response.ok) {
      const responseBodyText = await response.text();
      console.warn(`API: Job details request failed with token ${bearerToken.substring(0,10)}... Status: ${response.status}`, responseBodyText.substring(0, 300));
      return { error: true, status: response.status, body: responseBodyText.substring(0, 300) };
    }
    
    const data = await response.json();
    if (data.errors) {
      console.warn(`API: GraphQL API errors with token ${bearerToken.substring(0,10)}...:`, data.errors);
      return { error: true, graphqlErrors: data.errors };
    }
    
    return data.data.jobAuthDetails;
  } catch (error) { 
    console.error(`API: Network error with token ${bearerToken.substring(0,10)}...:`, error);
    return { error: true, networkError: error.message };
  }
}

/**
 * Fetches detailed job information by trying multiple API tokens until one succeeds.
 * @param {string} jobCiphertext The job's ciphertext ID from search results.
 * @returns {Promise<{jobDetails: Object, token: string}|{error: true, message: string, details?: any}>}
 *          Resolves with an object containing the job details and the successful token,
 *          or an error object if all tokens fail.
 */
async function fetchJobDetailsWithTokenRotation(jobCiphertext) {
  const apiResponse = await _executeApiCallWithStickyTokenRotation(fetchJobDetails, jobCiphertext);
  if (apiResponse.error) return apiResponse; // Propagate error
  return { jobDetails: apiResponse.result, token: apiResponse.token };
}

// Expose functions globally for MV2 background script
const UpworkAPI = {
    getAllPotentialApiTokens,
    fetchUpworkJobsDirectly,
    fetchJobsWithTokenRotation,
    fetchJobDetails,
    fetchJobDetailsWithTokenRotation
};

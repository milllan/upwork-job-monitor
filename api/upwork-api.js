/* exported UpworkAPI */
/**
 * Handles all interactions with the Upwork API.
 * This includes token retrieval, GraphQL payload construction, and fetch requests.
 */
console.log('Upwork API module loaded.');

const API_IDENTIFIERS = {
  JOB_SEARCH: 'jobSearch',
  JOB_DETAILS: 'jobDetails',
  TALENT_PROFILE: 'talentProfile',
};

/**
 * Retrieves and prioritizes potential OAuth2 API tokens from cookies.
 * @returns {Promise<string[]>} A promise that resolves with an array of token strings.
 */
async function getAllPotentialApiTokens() {
  try {
    const cookies = await browser.cookies.getAll({ domain: 'upwork.com' });
    if (!cookies || cookies.length === 0) {
      console.warn('API: No cookies found for upwork.com domain.');
      return [];
    }

    const allOAuthTokens = [];
    for (const cookie of cookies) {
      if (cookie.value && cookie.value.startsWith('oauth2v2_')) {
        allOAuthTokens.push({ name: cookie.name, value: cookie.value });
      }
    }

    if (allOAuthTokens.length === 0) {
      console.warn("API: No cookies matching 'oauth2v2_' prefix found.");
      return [];
    }

    const candidateTokens = [];

    // Prioritize 'sb' pattern tokens as they are often the active ones for GQL calls
    const sbPatternTokens = allOAuthTokens.filter(
      (t) => t.name.length === 10 && t.name.endsWith('sb') && t.name !== 'forterToken'
    );
    sbPatternTokens.forEach((t) => candidateTokens.unshift(t.value));

    // Add other potential oauth2v2_ tokens, excluding known non-API and already added ones
    const otherPotentials = allOAuthTokens.filter(
      (t) =>
        t.value.startsWith('oauth2v2_') && // Ensure it's an oauth2v2 token
        !candidateTokens.includes(t.value) && // Avoid duplicates
        t.name !== 'visitor_gql_token' &&
        t.name !== 'visitor_innova_gql_token' &&
        !t.name.includes('master_access_token') &&
        !t.name.includes('_vt')
    );
    otherPotentials.forEach((t) => candidateTokens.push(t.value));

    console.log('API_DEBUG: Found candidate tokens:', candidateTokens);

    return [...new Set(candidateTokens)]; // Ensure uniqueness
  } catch (error) {
    console.error('API: Error getting all cookies:', error.message);
    return [];
  }
}

/**
 * Private helper to execute a generic GraphQL query against the Upwork API.
 * This centralizes fetch logic, header creation, and error handling.
 * @param {string} bearerToken The OAuth2 bearer token.
 * @param {string} endpointAlias The alias for the GraphQL endpoint (e.g., 'userJobSearch').
 * @param {string} query The GraphQL query string.
 * @param {Object} variables The variables for the GraphQL query.
 * @returns {Promise<Object>} A promise that resolves with the full GraphQL response on success,
 *                            or a standardized error object {error: true, type: '...', ...} on failure.
 */
async function _executeGraphQLQuery(bearerToken, endpointAlias, query, variables) {
  const endpoint = `${config.UPWORK_GRAPHQL_ENDPOINT_BASE}?alias=${endpointAlias}`;
  const graphqlPayload = { query, variables };
  const requestHeadersForFetch = {
    Authorization: `Bearer ${bearerToken}`,
    'Content-Type': 'application/json',
    Accept: '*/*',
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: requestHeadersForFetch,
      body: JSON.stringify(graphqlPayload),
    });

    if (!response.ok) {
      const responseBodyText = await response.text();
      return {
        error: true,
        type: 'http',
        details: { status: response.status, body: responseBodyText.substring(0, 300) },
      };
    }

    const responseBodyText = await response.text();
    try {
      const data = JSON.parse(responseBodyText);
      // Check for application-level GraphQL errors, which come with a 200 OK status
      if (data.errors) {
        return { error: true, type: 'graphql', details: { errors: data.errors } };
      }
      return data; // Success
    } catch (parsingError) {
      console.warn(`Response text that failed parsing: ${responseBodyText.substring(0, 500)}`);
      return {
        error: true,
        type: 'parsing',
        details: { message: parsingError.message, body: responseBodyText.substring(0, 500) },
      };
    }
  } catch (error) {
    return { error: true, type: 'network', details: { message: error.message } };
  }
}

/**
 * Internal-only function to fetch Upwork jobs.
 * @private
 */
async function _fetchUpworkJobs(bearerToken, userQuery) {
  const endpointAlias = 'userJobSearch';
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
      highlight: true,
      paging: { offset: 0, count: config.API_FETCH_COUNT },
    },
  };
  const responseData = await _executeGraphQLQuery(
    bearerToken,
    endpointAlias,
    fullRawQueryString,
    variables
  );

  // If the helper returned an error, just pass it up.
  if (responseData.error) {
    return responseData;
  }

  const results = responseData.data?.search?.universalSearchNuxt?.userJobSearchV1?.results;
  if (!results) return [];

  return results.map((job) => ({
    id: job.jobTile.job.ciphertext || job.jobTile.job.id,
    ciphertext: job.jobTile.job.ciphertext,
    title: job.title,
    description: job.description,
    postedOn: job.jobTile.job.publishTime || job.jobTile.job.createTime,
    applied: job.applied,
    budget: {
      type: job.jobTile.job.jobType,
      currencyCode: job.jobTile.job.fixedPriceAmount?.isoCurrencyCode || 'USD',
      minAmount: job.jobTile.job.jobType.toLowerCase().includes('hourly')
        ? job.jobTile.job.hourlyBudgetMin
        : job.jobTile.job.fixedPriceAmount?.amount,
      maxAmount: job.jobTile.job.jobType.toLowerCase().includes('hourly')
        ? job.jobTile.job.hourlyBudgetMax
        : job.jobTile.job.fixedPriceAmount?.amount,
    },
    client: {
      paymentVerificationStatus: job.upworkHistoryData?.client?.paymentVerificationStatus,
      country: job.upworkHistoryData?.client?.country,
      totalSpent: job.upworkHistoryData?.client?.totalSpent?.amount || 0,
      rating: job.upworkHistoryData?.client?.totalFeedback,
    },
    skills:
      job.ontologySkills?.map((skill) => ({ name: skill.prettyName || skill.prefLabel })) || [],
    _fullJobData: job, // Keep this for debugging if needed
  }));
}

/**
 * Internal-only function to fetch job details.
 * @private
 */
async function _fetchJobDetails(bearerToken, jobCiphertext) {
  const endpointAlias = 'gql-query-get-auth-job-details';
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
          question
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
          contractorInfo {
            contractorName
            ciphertext
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
    isLoggedIn: true,
  };
  const responseData = await _executeGraphQLQuery(
    bearerToken,
    endpointAlias,
    graphqlQuery,
    variables
  );

  if (responseData.error) {
    return responseData;
  }
  return responseData.data?.jobAuthDetails || {};
}

/**
 * Internal-only function to fetch talent profile details.
 * @private
 */
async function _fetchTalentProfile(bearerToken, profileCiphertext) {
  const endpointAlias = 'getDetails';
  const graphqlQuery = `
    query GetTalentProfile($profileUrl: String) {
      talentVPDAuthProfile(filter: { profileUrl: $profileUrl }) {
        identity { uid ciphertext }
        profile { name title description location { country city } skills { node { prettyName rank } } }
        stats { totalHours totalJobsWorked rating hourlyRate { node { amount currencyCode } } totalEarnings }
      }
    }`;
  const variables = { profileUrl: profileCiphertext };
  const responseData = await _executeGraphQLQuery(
    bearerToken,
    endpointAlias,
    graphqlQuery,
    variables
  );

  if (responseData.error) return responseData;
  return responseData.data?.talentVPDAuthProfile || {};
}

/**
 * Internal helper to manage API calls with sticky token and rotation logic.
 * This version MERGES the robust error handling from the old function
 * with the new refactored structure.
 * @private
 */
async function _executeApiCallWithTokenRotation(apiIdentifier, apiCallFunction, ...params) {
  const operationName = apiCallFunction.name;
  const lastKnownGoodToken = await StorageManager.getApiEndpointToken(apiIdentifier);

  if (lastKnownGoodToken) {
    const result = await apiCallFunction(lastKnownGoodToken, ...params);
    if (result && !result.error) {
      return { result, token: lastKnownGoodToken }; // Return consistent object
    }
    // If the sticky token failed, clear it and proceed to full rotation.
    await StorageManager.setApiEndpointToken(apiIdentifier, null);
  }

  const candidateTokens = await getAllPotentialApiTokens();
  if (!candidateTokens || candidateTokens.length === 0) {
    return { error: true, type: 'auth', details: { message: 'No candidate API tokens found.' } };
  }

  let lastError = null; // <<<< IMPORTANT: Keep track of the last error
  for (const token of candidateTokens) {
    const result = await apiCallFunction(token, ...params);
    if (result && !result.error) {
      await StorageManager.setApiEndpointToken(apiIdentifier, token);
      return { result, token }; // Return consistent object
    }

    // --- THIS IS THE ROBUST LOGIC THAT WAS MISSING ---
    else if (result && result.error) {
      lastError = result; // Keep track of the specific error from the failed attempt
      const tokenSnippet = `token ${token.substring(0, 15)}`;
      const { type, details = {} } = result;
      switch (type) {
        case 'graphql':
          console.warn(
            `API: GraphQL error with ${tokenSnippet} for ${operationName} - ${JSON.stringify(details.errors)}`
          );
          break;
        case 'http':
          console.warn(
            `API: HTTP error ${details.status} with ${tokenSnippet} for ${operationName}`
          );
          break;
        case 'network':
          console.warn(
            `API: Network error with ${tokenSnippet} for ${operationName}: ${details.message}`
          );
          break;
        case 'parsing':
          console.warn(
            `API: JSON parsing error with ${tokenSnippet} for ${operationName}: ${details.message}`
          );
          break;
        default:
          console.warn(`API: An unknown error occurred with ${tokenSnippet} for ${operationName}`);
      }
    }
    // --- END OF ROBUST LOGIC ---
  }

  console.error(`API: All candidate tokens failed for ${operationName} (${apiIdentifier}).`);
  // Return the *last specific error* we encountered, which is much more useful than a generic message.
  return (
    lastError || { error: true, type: 'auth', details: { message: 'All candidate tokens failed.' } }
  );
}

// =================================================================================
// PUBLIC API INTERFACE
// =================================================================================
const UpworkAPI = {
  /**
   * Fetches a list of jobs, handling token rotation automatically.
   * @returns {Promise<{jobs: Object[]}|{error: boolean, ...}>}
   */
  fetchJobs: async (userQuery) => {
    const response = await _executeApiCallWithTokenRotation(
      API_IDENTIFIERS.JOB_SEARCH,
      _fetchUpworkJobs,
      userQuery
    );
    if (response.error) {
      return response;
    }
    return { jobs: response.result };
  },

  /**
   * Fetches the details for a specific job, handling token rotation automatically.
   * @returns {Promise<{jobDetails: Object}|{error: boolean, ...}>}
   */
  fetchJobDetails: async (jobCiphertext) => {
    const response = await _executeApiCallWithTokenRotation(
      API_IDENTIFIERS.JOB_DETAILS,
      _fetchJobDetails,
      jobCiphertext
    );
    if (response.error) {
      return response;
    }
    return { jobDetails: response.result };
  },

  /**
   * Fetches the profile for a specific freelancer, handling token rotation automatically.
   * @param {string} profileCiphertext The freelancer's ciphertext ID.
   * @returns {Promise<{profileDetails: Object}|{error: boolean, ...}>}
   */
  fetchTalentProfile: async (profileCiphertext) => {
    const response = await _executeApiCallWithTokenRotation(
      API_IDENTIFIERS.TALENT_PROFILE,
      _fetchTalentProfile,
      profileCiphertext
    );
    if (response.error) {
      return response;
    }
    return { profileDetails: response.result };
  },
};

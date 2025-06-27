/* exported UpworkAPI */
/**
 * Handles all interactions with the Upwork API.
 * This includes token retrieval, GraphQL payload construction, and fetch requests.
 */
console.log('Upwork API module loaded.');

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
 *                            or an error object {error: true, ...} on failure.
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
      console.warn(
        `API (_executeGraphQLQuery): Request failed for alias ${endpointAlias} with token ${bearerToken.substring(0, 10)}... Status: ${response.status}`,
        responseBodyText.substring(0, 300)
      );
      return { error: true, status: response.status, body: responseBodyText.substring(0, 300) };
    }

    const data = await response.json();
    return data; // Return the full response for the caller to check for errors and destructure
  } catch (error) {
    console.error(
      `API (_executeGraphQLQuery): Network error for alias ${endpointAlias} with token ${bearerToken.substring(0, 10)}...:`,
      error
    );
    return { error: true, networkError: error.message };
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
      highlight: false,
      paging: { offset: 0, count: config.API_FETCH_COUNT }, // Use config value
    },
  };

  const responseData = await _executeGraphQLQuery(
    bearerToken,
    endpointAlias,
    fullRawQueryString,
    variables
  );

  // Handle errors returned from the helper
  if (responseData.error) {
    return responseData; // Propagate the error object
  }
  if (responseData.errors) {
    console.warn(`API (fetchUpworkJobsDirectly): GraphQL errors:`, responseData.errors);
    return { error: true, graphqlErrors: responseData.errors };
  }

  // Process successful data
  if (responseData.data?.search?.universalSearchNuxt?.userJobSearchV1?.results) {
    const jobsData = responseData.data.search.universalSearchNuxt.userJobSearchV1.results;
    return jobsData.map((job) => ({
      id: job.jobTile.job.ciphertext || job.jobTile.job.id, // Prefer ciphertext from jobTile
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
      skills: job.ontologySkills
        ? job.ontologySkills.map((skill) => ({ name: skill.prettyName || skill.prefLabel }))
        : [],
      _fullJobData: job, // Keep this for debugging if needed
    }));
  } else {
    return [];
  }
}

/**
 * Internal helper to manage API calls with sticky token and rotation logic.
 * @param {string} apiIdentifier The API endpoint identifier (e.g., 'jobSearch', 'jobDetails').
 * @param {Function} apiCallFunction The actual API call function (e.g., fetchUpworkJobsDirectly, fetchJobDetails).
 * @param {any[]} params Parameters to pass to the apiCallFunction after the token.
 * @returns {Promise<{result: any, token: string}|{error: true, message: string, details?: any}>}
 *          Resolves with an object containing the API call's result and the successful token,
 *          or an error object if all tokens fail.
 */
async function _executeApiCallWithStickyTokenRotation(apiIdentifier, apiCallFunction, ...params) {
  const operationName = apiCallFunction.name; // For logging

  // 1. Try with the last known good token for this endpoint
  const lastKnownGoodToken = await StorageManager.getApiEndpointToken(apiIdentifier);
  if (lastKnownGoodToken) {
    const result = await apiCallFunction(lastKnownGoodToken, ...params);
    if (result && !result.error && !result.permissionIssue) {
      console.log(
        `API: Successfully used last known good token for ${operationName} (${apiIdentifier}).`
      );
      return { result, token: lastKnownGoodToken };
    } else {
      console.warn(
        `API: Last known good token failed for ${operationName} (${apiIdentifier}). Clearing it and trying full rotation.`
      );
      await StorageManager.setApiEndpointToken(apiIdentifier, null); // Clear the failing sticky token for this endpoint
    }
  }

  // 2. If no sticky token or it failed, proceed with full rotation
  const candidateTokens = await getAllPotentialApiTokens();
  if (!candidateTokens || candidateTokens.length === 0) {
    console.error(`API: Cannot perform ${operationName}, no candidate tokens found.`);
    return { error: true, message: `No candidate API tokens found for ${operationName}.` };
  }

  for (const token of candidateTokens) {
    const result = await apiCallFunction(token, ...params);
    if (result && !result.error && !result.permissionIssue) {
      console.log(
        `API: Successfully fetched with token ${token.substring(0, 15)}... for ${operationName} (${apiIdentifier}). Setting as new good token.`
      );
      await StorageManager.setApiEndpointToken(apiIdentifier, token);
      return { result, token: token };
    } else {
      if (result && result.graphqlErrors) {
        console.warn(
          `API: GraphQL error with token ${token.substring(0, 15)} for ${operationName} - ${JSON.stringify(result.graphqlErrors)}`
        );
      } else if (result && result.status) {
        console.warn(
          `API: HTTP error ${result.status} with token ${token.substring(0, 15)} for ${operationName}`
        );
      } else if (result && result.networkError) {
        console.warn(
          `API: Network error with token ${token.substring(0, 15)} for ${operationName}`
        );
      } else if (result && result.permissionIssue) {
        console.warn(
          `API: Permission issue with token ${token.substring(0, 15)} for ${operationName}: ${result.message}`
        );
      }
      // console.log(`API: Token ${token.substring(0, 15)}... failed for ${operationName}. Trying next.`);
    }
  }

  console.error(`API: All candidate tokens failed for ${operationName} (${apiIdentifier}).`);
  return { error: true, message: `All candidate tokens failed for ${operationName}.` };
}

/**
 * Fetches Upwork jobs using the sticky token rotation strategy.
 * @param {string} userQuery The user's search query string.
 * @returns {Promise<{jobs: Object[], token: string}|{error: true, message: string, details?: any}>}
 */
async function fetchJobsWithTokenRotation(userQuery) {
  const apiResponse = await _executeApiCallWithStickyTokenRotation(
    'jobSearch',
    fetchUpworkJobsDirectly,
    userQuery
  );
  if (apiResponse.error) {
    return apiResponse;
  }
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
  if (responseData.errors) {
    console.warn(`API (fetchJobDetails): GraphQL errors:`, responseData.errors);
    return { error: true, graphqlErrors: responseData.errors };
  }

  return responseData.data.jobAuthDetails;
}

/**
 * Fetches detailed job information by trying multiple API tokens until one succeeds.
 * @param {string} jobCiphertext The job's ciphertext ID from search results.
 * @returns {Promise<{jobDetails: Object, token: string}|{error: true, message: string, details?: any}>}
 *          Resolves with an object containing the job details and the successful token,
 *          or an error object if all tokens fail.
 */
async function fetchJobDetailsWithTokenRotation(jobCiphertext) {
  const apiResponse = await _executeApiCallWithStickyTokenRotation(
    'jobDetails',
    fetchJobDetails,
    jobCiphertext
  );
  if (apiResponse.error) {
    return apiResponse;
  }
  return { jobDetails: apiResponse.result, token: apiResponse.token };
}

/**
 * Fetches talent profile details directly using a provided bearer token and profile ciphertext.
 * @param {string} bearerToken The OAuth2 bearer token.
 * @param {string} profileCiphertext The freelancer's ciphertext ID.
 * @returns {Promise<Object>} A promise that resolves with the profile details object on success,
 *                                   or an error object {error: true, ...} on failure.
 */
async function fetchTalentProfile(bearerToken, profileCiphertext) {
  const endpointAlias = 'getDetails';
  const graphqlQuery = `
    query GetTalentProfile($profileUrl: String) {
      talentVPDAuthProfile(
        filter: {
          profileUrl: $profileUrl,
          excludePortfolio: true,
          excludeAgencies: false
        }
      ) {
        identity { uid ciphertext }
        profile {
          name
          title
          description
          location { country city }
          skills { node { prettyName rank } }
        }
        stats {
          totalHours
          totalJobsWorked
          rating
          hourlyRate { node { amount currencyCode } }
          totalEarnings
        }
        employmentHistory { companyName jobTitle startDate endDate description }
        education { institutionName areaOfStudy degree }
      }
    }
  `;
  const variables = { profileUrl: profileCiphertext };

  const responseData = await _executeGraphQLQuery(
    bearerToken,
    endpointAlias,
    graphqlQuery,
    variables
  );

  if (responseData.error) {
    return responseData;
  }
  if (responseData.errors) {
    console.warn(`API (fetchTalentProfile): GraphQL errors:`, responseData.errors);
    return { error: true, graphqlErrors: responseData.errors };
  }

  return responseData.data.talentVPDAuthProfile;
}

/**
 * Fetches talent profile details by trying multiple API tokens until one succeeds.
 * @param {string} profileCiphertext The freelancer's ciphertext ID.
 * @returns {Promise<{profileDetails: Object, token: string}|{error: true, message: string, details?: any}>}
 */
async function fetchTalentProfileWithTokenRotation(profileCiphertext) {
  const apiResponse = await _executeApiCallWithStickyTokenRotation(
    'talentProfile',
    fetchTalentProfile,
    profileCiphertext
  );
  if (apiResponse.error) {
    return apiResponse;
  }
  return { profileDetails: apiResponse.result, token: apiResponse.token };
}

// Expose functions globally for MV2 background script
const UpworkAPI = {
  getAllPotentialApiTokens,
  fetchUpworkJobsDirectly,
  fetchJobsWithTokenRotation,
  fetchJobDetails,
  fetchJobDetailsWithTokenRotation,
  fetchTalentProfileWithTokenRotation,
};

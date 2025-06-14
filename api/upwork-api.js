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

    let prioritizedTokens = [];
    const sbPatternTokens = allOAuthTokens.filter(t =>
      t.name.length === 10 && t.name.endsWith("sb") &&
      t.name !== "forterToken"
    );
    sbPatternTokens.forEach(t => prioritizedTokens.push(t.value));

    const otherPotentials = allOAuthTokens.filter(t =>
      !sbPatternTokens.some(sbt => sbt.name === t.name) &&
      t.name !== "oauth2_global_js_token" &&
      t.name !== "visitor_gql_token" &&
      t.name !== "visitor_innova_gql_token" &&
      !t.name.includes("master_access_token") &&
      !t.name.includes("_vt")
    );
    otherPotentials.forEach(t => prioritizedTokens.push(t.value));

    const globalJsToken = allOAuthTokens.find(t => t.name === "oauth2_global_js_token");
    if (globalJsToken && !prioritizedTokens.includes(globalJsToken.value)) {
      prioritizedTokens.push(globalJsToken.value);
    }
    
    const uniquePrioritizedTokens = [...new Set(prioritizedTokens)];
    console.log("API: Candidate API tokens (prioritized):", uniquePrioritizedTokens.map(t => t.substring(0,20) + "..."));
    return uniquePrioritizedTokens;
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
  // config object is expected to be globally available from config.js
  const endpoint = `${config.UPWORK_GRAPHQL_ENDPOINT_BASE}?alias=userJobSearch`;
  const fullRawQueryString = `
  query UserJobSearch($requestVariables: UserJobSearchV1Request!) {
    search {
      universalSearchNuxt {
        userJobSearchV1(request: $requestVariables) {
          paging { total offset count }
          results {
            id title description relevanceEncoded applied
            ontologySkills { uid prefLabel prettyName: prefLabel }
            connectPrice
            upworkHistoryData { client { paymentVerificationStatus country totalSpent { amount } totalFeedback } }
            jobTile { job { id ciphertext: cipherText publishTime createTime jobType hourlyBudgetMin hourlyBudgetMax fixedPriceAmount { amount isoCurrencyCode } } }
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
      // Return all jobs, including applied ones. The 'applied' status will be used by the caller.
      return jobsData.map(job => ({
        id: job.jobTile.job.ciphertext || job.jobTile.job.id, ciphertext: job.jobTile.job.ciphertext, title: job.title, description: job.description, postedOn: job.jobTile.job.publishTime || job.jobTile.job.createTime, applied: job.applied,
        budget: { amount: job.jobTile.job.fixedPriceAmount?.amount || job.jobTile.job.hourlyBudgetMin || job.jobTile.job.hourlyBudgetMax, currencyCode: job.jobTile.job.fixedPriceAmount?.isoCurrencyCode || 'USD', type: job.jobTile.job.jobType },
        client: { paymentVerificationStatus: job.upworkHistoryData?.client?.paymentVerificationStatus, country: job.upworkHistoryData?.client?.country, totalSpent: job.upworkHistoryData?.client?.totalSpent?.amount || 0, rating: job.upworkHistoryData?.client?.totalFeedback, },
        skills: job.ontologySkills ? job.ontologySkills.map(skill => ({ name: skill.prettyName || skill.prefLabel })) : [],
        _fullJobData: job
      }));
    } else { return []; }
  } catch (error) { 
    console.error(`API: Network error with token ${bearerToken.substring(0,10)}...:`, error);
    return { error: true, networkError: error.message };
  }
}

/**
 * Fetches Upwork jobs by trying multiple API tokens until one succeeds.
 * @param {string} userQuery The user's search query string.
 * @returns {Promise<{jobs: Object[], token: string}|{error: true, message: string, details?: any}>}
 *          Resolves with an object containing the jobs array and the successful token,
 *          or an error object if all tokens fail.
 */
async function fetchJobsWithTokenRotation(userQuery) {
  const candidateTokens = await getAllPotentialApiTokens();
  if (!candidateTokens || candidateTokens.length === 0) {
    console.error("API: Cannot fetch jobs, no candidate tokens found.");
    return { error: true, message: "No candidate API tokens found." };
  }

  for (const token of candidateTokens) {
    console.log(`API: Trying token ${token.substring(0, 15)}... for query: "${userQuery.substring(0,50)}..."`);
    const result = await fetchUpworkJobsDirectly(token, userQuery);

    if (result && !result.error) {
      console.log(`API: Successfully fetched jobs with token ${token.substring(0,15)}...`);
      return { jobs: result, token: token }; // Success
    } else {
      // Log specific error from fetchUpworkJobsDirectly if an error object was returned
      if (result && result.graphqlErrors) {
        console.warn(`API: GraphQL error with token ${token.substring(0,15)}... - ${JSON.stringify(result.graphqlErrors)}`);
      } else if (result && result.status) {
        console.warn(`API: HTTP error ${result.status} with token ${token.substring(0,15)}...`);
      } else if (result && result.networkError) {
         console.warn(`API: Network error with token ${token.substring(0,15)}...`);
      }
      console.log(`API: Token ${token.substring(0,15)}... failed. Trying next.`);
    }
  }

  console.error("API: All candidate tokens failed to fetch jobs.");
  return { error: true, message: "All candidate tokens failed." };
}

// Expose functions globally for MV2 background script
const UpworkAPI = {
    getAllPotentialApiTokens,
    fetchUpworkJobsDirectly,
    fetchJobsWithTokenRotation // Add the new function
};
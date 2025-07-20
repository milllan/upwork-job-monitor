import {
  Job,
  JobDetails,
  TalentProfile,
  GraphQLResponse,
  isGraphQLResponse,
} from '../types.js';

import { config } from '../background/config.js';
import { StorageManager } from '../storage/storage-manager.js';

const API_IDENTIFIERS = {
  JOB_SEARCH: 'jobSearch',
  JOB_DETAILS: 'jobDetails',
  TALENT_PROFILE: 'talentProfile',
};

/**
 * Retrieves all potential OAuth2 API tokens from Upwork cookies, prioritizing tokens likely to be active for GraphQL API calls.
 *
 * @returns A promise that resolves to an array of unique OAuth2 token strings, ordered by likelihood of validity.
 */
async function getAllPotentialApiTokens(): Promise<string[]> {
  try {
    const cookies = await browser.cookies.getAll({ domain: 'upwork.com' });
    if (!cookies || cookies.length === 0) {
      console.warn('API: No cookies found for upwork.com domain.');
      return [];
    }

    const allOAuthTokens: { name: string; value: string }[] = [];
    for (const cookie of cookies) {
      if (cookie.value && cookie.value.startsWith('oauth2v2_')) {
        allOAuthTokens.push({ name: cookie.name, value: cookie.value });
      }
    }

    if (allOAuthTokens.length === 0) {
      console.warn("API: No cookies matching 'oauth2v2_' prefix found.");
      return [];
    }

    const candidateTokens: string[] = [];

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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error getting cookies';
    console.error('API: Error getting all cookies:', message);
    return [];
  }
}

/**
 * Executes a GraphQL POST request to the Upwork API using the provided bearer token and endpoint alias.
 *
 * Handles HTTP, network, and parsing errors, and returns either the parsed GraphQL response or a standardized error object.
 *
 * @returns The parsed GraphQL response on success, or an error object with details on failure.
 */
async function _executeGraphQLQuery<T>(
  bearerToken: string,
  endpointAlias: string,
  query: string,
  variables: Record<string, unknown>
): Promise<GraphQLResponse<T>> {
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
    } catch (parsingError: unknown) {
      const message = parsingError instanceof Error ? parsingError.message : 'Unknown parsing error';
      console.warn(`Response text that failed parsing: ${responseBodyText.substring(0, 500)}`);
      return {
        error: true,
        type: 'parsing',
        details: { message, body: responseBodyText.substring(0, 500) },
      };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown network error';
    return { error: true, type: 'network', details: { message } };
  }
}

/**
 * Returns the minimum or maximum budget amount for a job based on its type.
 *
 * @param job - The raw job data object
 * @param isMin - If true, returns the minimum hourly budget; if false, returns the maximum hourly budget or fixed price
 * @returns The budget amount, or 0 if unavailable
 */
function getBudgetAmount(job: RawUpworkJob, isMin: boolean): number {
  const isHourly = job.jobTile.job.jobType.toLowerCase().includes('hourly');
  if (isHourly) {
    return (isMin ? job.jobTile.job.hourlyBudgetMin : job.jobTile.job.hourlyBudgetMax) || 0;
  }
  return job.jobTile.job.fixedPriceAmount?.amount || 0;
}

/**
 * Internal-only function to fetch Upwork jobs.
 * @private
 */

interface RawUpworkJob {
  id: string;
  title: string;
  description: string;
  applied: boolean;
  ontologySkills?: { prettyName?: string; prefLabel?: string }[];
  jobTile: {
    job: {
      id: string;
      ciphertext: string;
      publishTime: string;
      createTime: string;
      jobType: string;
      hourlyBudgetMin?: number;
      hourlyBudgetMax?: number;
      fixedPriceAmount?: { amount: number; isoCurrencyCode: string };
    };
  };
  upworkHistoryData?: {
    client?: {
      paymentVerificationStatus: string;
      country: string;
      totalSpent?: { amount: number };
      totalFeedback: number;
    };
  };
}

interface UserJobSearchResponse {
  search: {
    universalSearchNuxt: {
      userJobSearchV1: {
        results: RawUpworkJob[];
      };
    };
  };
}

/**
 * Fetches a list of jobs from Upwork matching the specified user query.
 *
 * Returns an array of simplified `Job` objects containing job details, client information, and skills, or an error response if the API call fails.
 *
 * @param bearerToken - The OAuth2 bearer token used for authentication
 * @param userQuery - The search query string to filter jobs
 * @returns An array of `Job` objects on success, or a `GraphQLResponse` error object on failure
 */
async function _fetchUpworkJobs(
  bearerToken: string,
  userQuery: string
): Promise<Job[] | GraphQLResponse<unknown>> {
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
      paging: { offset: 0, count: config.API_FETCH_COUNT },
    },
  };
  const responseData = await _executeGraphQLQuery<UserJobSearchResponse>(
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
  if (!results) {
    return [];
  }

  return results.map((job: RawUpworkJob): Job => ({
    id: job.jobTile.job.ciphertext || job.jobTile.job.id,
    ciphertext: job.jobTile.job.ciphertext,
    title: job.title,
    description: job.description,
    postedOn: job.jobTile.job.publishTime || job.jobTile.job.createTime,
    applied: job.applied,
    budget: {
      type: job.jobTile.job.jobType,
      currencyCode: job.jobTile.job.fixedPriceAmount?.isoCurrencyCode || 'USD',
      minAmount: getBudgetAmount(job, true),
      maxAmount: getBudgetAmount(job, false),
    },
    client: {
      paymentVerificationStatus: job.upworkHistoryData?.client?.paymentVerificationStatus || 'N/A',
      country: job.upworkHistoryData?.client?.country || 'N/A',
      totalSpent: job.upworkHistoryData?.client?.totalSpent?.amount || 0,
      rating: job.upworkHistoryData?.client?.totalFeedback || null,
    },
    skills:
      job.ontologySkills?.map((skill) => ({ name: skill.prettyName || skill.prefLabel || '' })) || [],
    _fullJobData: job as unknown as Record<string, unknown>, // Keep this for debugging if needed
  }));
}

/**
 * Retrieves detailed information for a specific Upwork job using its ciphertext ID.
 *
 * Returns the job details object if found, `null` if the job does not exist, or an error response if the query fails.
 */
async function _fetchJobDetails(
  bearerToken: string,
  jobCiphertext: string
): Promise<JobDetails | null | GraphQLResponse<unknown>> {
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
  const responseData = await _executeGraphQLQuery<{ jobAuthDetails: JobDetails }>(
    bearerToken,
    endpointAlias,
    graphqlQuery,
    variables
  );

  if (responseData.error) {
    return responseData;
  }
  return responseData.data?.jobAuthDetails || null;
}

/**
 * Retrieves a freelancer's talent profile details by ciphertext profile URL.
 *
 * @param profileCiphertext - The ciphertext identifier for the freelancer's profile
 * @returns The talent profile object if found, `null` if not found, or a GraphQL error response on failure
 */
async function _fetchTalentProfile(
  bearerToken: string,
  profileCiphertext: string
): Promise<TalentProfile | null | GraphQLResponse<unknown>> {
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
  const responseData = await _executeGraphQLQuery<{ talentVPDAuthProfile: TalentProfile }>(
    bearerToken,
    endpointAlias,
    graphqlQuery,
    variables
  );

  if (responseData.error) {return responseData;}
  return responseData.data?.talentVPDAuthProfile || null;
}

/**
 * Executes an API call with automatic token rotation and sticky token caching.
 *
 * Attempts the API call using the last known good token for the specified API identifier. If that token fails, iterates through all available candidate tokens until a successful call is made or all tokens fail. On success, caches the working token for future use. Returns the result and token on success, or the last encountered error response if all tokens fail.
 *
 * @param apiIdentifier - Unique identifier for the API endpoint to associate with sticky token caching
 * @param apiCallFunction - The API call function to execute, which accepts a bearer token as its first argument
 * @param params - Additional arguments to pass to the API call function
 * @returns An object containing the successful result and token, or a detailed error response if all tokens fail
 */
async function _executeApiCallWithTokenRotation<T>(
  apiIdentifier: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apiCallFunction: (bearerToken: string, ...args: any[]) => Promise<T>,
  ...params: unknown[]
): Promise<{ result: T; token: string } | GraphQLResponse<unknown>> {
  const operationName = apiCallFunction.name;
  const lastKnownGoodToken = await StorageManager.getApiEndpointToken(apiIdentifier);

  if (lastKnownGoodToken) {
    const result = await apiCallFunction(lastKnownGoodToken, ...params);
    if (result && !isGraphQLResponse(result)) {
      return { result, token: lastKnownGoodToken }; // Return consistent object
    }
    // If the sticky token failed, clear it and proceed to full rotation.
    await StorageManager.setApiEndpointToken(apiIdentifier, null);
  }

  const candidateTokens = await getAllPotentialApiTokens();
  if (!candidateTokens || candidateTokens.length === 0) {
    return { error: true, type: 'auth', details: { message: 'No candidate API tokens found.' } };
  }

  let lastError: GraphQLResponse<unknown> | null = null; // <<<< IMPORTANT: Keep track of the last error
  for (const token of candidateTokens) {
    const result = await apiCallFunction(token, ...params);
    if (result && !isGraphQLResponse(result)) {
      await StorageManager.setApiEndpointToken(apiIdentifier, token);
      return { result, token }; // Return consistent object
    }

    // --- THIS IS THE ROBUST LOGIC THAT WAS MISSING ---
    else if (isGraphQLResponse(result)) {
      lastError = result; // Keep track of the specific error from the failed attempt
      const tokenSnippet = `token ${token.substring(0, 15)}`;
      if (lastError) {
        const { type, details = {} } = lastError;
        switch (type) {
          case 'graphql':
            console.warn(
              `API: GraphQL error with ${tokenSnippet} for ${operationName} - ${JSON.stringify(
                details.errors
              )}`
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
              `API: JSON parsing error with ${tokenSnippet} for ${operationName}: ${
                details.message
              }`
            );
            break;
          default:
            console.warn(
              `API: An unknown error occurred with ${tokenSnippet} for ${operationName}`
            );
        }
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
   * @returns {Promise<{jobs: Job[]}|GraphQLResponse<any>>}
   */
  fetchJobs: async (userQuery: string): Promise<{ jobs: Job[] } | GraphQLResponse<unknown>> => {
    const response = await _executeApiCallWithTokenRotation(
      API_IDENTIFIERS.JOB_SEARCH,
      _fetchUpworkJobs,
      userQuery
    );
    if ('result' in response) {
      return { jobs: response.result as Job[] };
    }
    return response;
  },

  /**
   * Fetches the details for a specific job, handling token rotation automatically.
   * @returns {Promise<{jobDetails: JobDetails | null}|GraphQLResponse<any>>}
   */
  fetchJobDetails: async (
    jobCiphertext: string
  ): Promise<{ jobDetails: JobDetails | null } | GraphQLResponse<unknown>> => {
    const response = await _executeApiCallWithTokenRotation(
      API_IDENTIFIERS.JOB_DETAILS,
      _fetchJobDetails,
      jobCiphertext
    );
    if ('result' in response) {
      return { jobDetails: response.result as JobDetails | null };
    }
    return response;
  },

  /**
   * Fetches the profile for a specific freelancer, handling token rotation automatically.
   * @param {string} profileCiphertext The freelancer's ciphertext ID.
   * @returns {Promise<{profileDetails: TalentProfile | null}|GraphQLResponse<any>>}
   */
  fetchTalentProfile: async (
    profileCiphertext: string
  ): Promise<{ profileDetails: TalentProfile | null } | GraphQLResponse<unknown>> => {
    const response = await _executeApiCallWithTokenRotation(
      API_IDENTIFIERS.TALENT_PROFILE,
      _fetchTalentProfile,
      profileCiphertext
    );
    if ('result' in response) {
      return { profileDetails: response.result as TalentProfile | null };
    }
    return response;
  },
};

export { UpworkAPI };

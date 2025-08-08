import {
  Job,
  JobDetails,
  TalentProfile,
  safeParseJobSearchResponse,
  safeParseJobDetailsResponse,
  safeParseTalentProfileResponse,
  JobSearchResponse,
  JobDetailsResponse,
  TalentProfileResponse,
  CleanJobSchema,
  CleanJobDetailsSchema,
  CleanTalentProfileSchema,
} from '../schemas.js';
import { GraphQLResponse, isGraphQLResponse } from '../types.js';
import { z } from 'zod';

import { config } from '../background/config.js';
import { StorageManager } from '../storage/storage-manager.js';

const API_IDENTIFIERS = {
  JOB_SEARCH: 'jobSearch',
  JOB_DETAILS: 'jobDetails',
  TALENT_PROFILE: 'talentProfile',
};

/**
 * Retrieves and prioritizes potential OAuth2 API tokens from cookies.
 * @returns {Promise<string[]>} A promise that resolves with an array of token strings.
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

    if (config.DEBUG_MODE) {
      console.log('API_DEBUG: Found candidate tokens:', candidateTokens);
    }

    return [...new Set(candidateTokens)]; // Ensure uniqueness
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error getting cookies';
    console.error('API: Error getting all cookies:', message);
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
      return { data }; // Success
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

async function _fetchUpworkJobs(
  bearerToken: string,
  userQuery: string
): Promise<GraphQLResponse<Job[]>> {
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
  const responseData = await _executeGraphQLQuery<JobSearchResponse>(
    bearerToken,
    endpointAlias,
    fullRawQueryString,
    variables
  );

  if (responseData.error) {
    return responseData;
  }

  const validationResult = safeParseJobSearchResponse(responseData.data);
  if (!validationResult.success) {
    console.error('API: Zod validation failed for Job Search response:', validationResult.error.issues);
    return {
      error: true,
      type: 'validation',
      details: {
        message: 'Job Search response failed schema validation.',
        zodIssues: validationResult.error.issues,
      },
    };
  }

  const results = validationResult.data.data?.search.universalSearchNuxt?.userJobSearchV1?.results;
  if (!results) {
    return { data: [] };
  }

  try {
    const cleanedJobs = CleanJobSchema.array().parse(results);
    return { data: cleanedJobs };
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('API: Zod parsing failed after validation for Job Search:', error.issues);
    } else {
      console.error('API: An unknown error occurred during job search parsing:', error);
    }
    return {
      error: true,
      type: 'validation',
      details: {
        message: 'Failed to transform validated job search data.',
        zodIssues: error instanceof z.ZodError ? error.issues : [],
      },
    };
  }
}

async function _fetchJobDetails(
  bearerToken: string,
  jobCiphertext: string
): Promise<GraphQLResponse<JobDetails | null>> {
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
  const responseData = await _executeGraphQLQuery<JobDetailsResponse>(
    bearerToken,
    endpointAlias,
    graphqlQuery,
    variables
  );

  if (responseData.error) {
    return responseData;
  }

  const validationResult = safeParseJobDetailsResponse(responseData.data);
  if (!validationResult.success) {
    console.error('API: Zod validation failed for Job Details response:', validationResult.error.issues);
    return {
      error: true,
      type: 'validation',
      details: {
        message: 'Job Details response failed schema validation.',
        zodIssues: validationResult.error.issues,
      },
    };
  }

  const details = validationResult.data.data?.jobAuthDetails;
  if (!details) {
    return { data: null };
  }

  try {
    const cleanedDetails = CleanJobDetailsSchema.parse(details);
    return { data: cleanedDetails };
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('API: Zod parsing failed after validation for Job Details:', error.issues);
    } else {
      console.error('API: An unknown error occurred during job details parsing:', error);
    }
    return {
      error: true,
      type: 'validation',
      details: {
        message: 'Failed to transform validated job details data.',
        zodIssues: error instanceof z.ZodError ? error.issues : [],
      },
    };
  }
}

async function _fetchTalentProfile(
  bearerToken: string,
  profileCiphertext: string
): Promise<GraphQLResponse<TalentProfile | null>> {
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
  const responseData = await _executeGraphQLQuery<TalentProfileResponse>(
    bearerToken,
    endpointAlias,
    graphqlQuery,
    variables
  );

  if (responseData.error) {
    return responseData;
  }

  const validationResult = safeParseTalentProfileResponse(responseData.data);
  if (!validationResult.success) {
    console.error(
      'API: Zod validation failed for Talent Profile response:',
      validationResult.error.issues
    );
    return {
      error: true,
      type: 'validation',
      details: {
        message: 'Talent Profile response failed schema validation.',
        zodIssues: validationResult.error.issues,
      },
    };
  }

  const profile = validationResult.data.data?.talentVPDAuthProfile;
  if (!profile) {
    return { data: null };
  }

  try {
    const cleanedProfile = CleanTalentProfileSchema.parse(profile);
    return { data: cleanedProfile };
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('API: Zod parsing failed after validation for Talent Profile:', error.issues);
    } else {
      console.error('API: An unknown error occurred during talent profile parsing:', error);
    }
    return {
      error: true,
      type: 'validation',
      details: {
        message: 'Failed to transform validated talent profile data.',
        zodIssues: error instanceof z.ZodError ? error.issues : [],
      },
    };
  }
}

type ApiResult<T> = { result: T; token: string };
type ApiError = GraphQLResponse<never>;

async function _executeApiCallWithTokenRotation<T, Params extends unknown[]>(
  apiIdentifier: string,
  apiCallFunction: (bearerToken: string, ...args: Params) => Promise<GraphQLResponse<T>>,
  ...params: Params
): Promise<ApiResult<T> | ApiError> {
  const operationName = apiCallFunction.name;
  const lastKnownGoodToken = await StorageManager.getApiEndpointToken(apiIdentifier);

  if (lastKnownGoodToken) {
    const response = await apiCallFunction(lastKnownGoodToken, ...params);
    if (!response.error) {
      return { result: response.data, token: lastKnownGoodToken };
    }
    await StorageManager.setApiEndpointToken(apiIdentifier, null);
  }

  const candidateTokens = await getAllPotentialApiTokens();
  if (!candidateTokens || candidateTokens.length === 0) {
    return { error: true, type: 'auth', details: { message: 'No candidate API tokens found.' } };
  }

  let lastError: ApiError | null = null;
  for (const token of candidateTokens) {
    const response = await apiCallFunction(token, ...params);
    if (response.error) {
      lastError = response;
    } else {
      await StorageManager.setApiEndpointToken(apiIdentifier, token);
      return { result: response.data, token };
    }
  }

  console.error(`API: All candidate tokens failed for ${operationName} (${apiIdentifier}).`);
  return (
    lastError || { error: true, type: 'auth', details: { message: 'All candidate tokens failed.' } }
  );
}

// =================================================================================
// PUBLIC API INTERFACE
// =================================================================================
const UpworkAPI = {
  fetchJobs: async (
    userQuery: string
  ): Promise<{ jobs?: Job[]; error?: ApiError }> => {
    const response = await _executeApiCallWithTokenRotation(
      API_IDENTIFIERS.JOB_SEARCH,
      _fetchUpworkJobs,
      userQuery
    );
    if ('result' in response) {
      return { jobs: response.result };
    }
    return { error: response };
  },

  fetchJobDetails: async (
    jobCiphertext: string
  ): Promise<{ jobDetails?: JobDetails | null; error?: ApiError }> => {
    const response = await _executeApiCallWithTokenRotation(
      API_IDENTIFIERS.JOB_DETAILS,
      _fetchJobDetails,
      jobCiphertext
    );
    if ('result' in response) {
      return { jobDetails: response.result };
    }
    return { error: response };
  },

  fetchTalentProfile: async (
    profileCiphertext: string
  ): Promise<{ profileDetails?: TalentProfile | null; error?: ApiError }> => {
    const response = await _executeApiCallWithTokenRotation(
      API_IDENTIFIERS.TALENT_PROFILE,
      _fetchTalentProfile,
      profileCiphertext
    );
    if ('result' in response) {
      return { profileDetails: response.result };
    }
    return { error: response };
  },
};

export { UpworkAPI };

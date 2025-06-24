/**
 * Fetches Upwork jobs by trying multiple API tokens until one succeeds.
 * @param {string} userQuery The user's search query string.
 * @returns {Promise<{jobs: Object[], token: string}|{error: true, message: string, details?: any}>}
 *          Resolves with an object containing the jobs array and the successful token,
 *          or an error object if all tokens fail.
 * from api/upwork-api.js
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
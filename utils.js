// utils.js

/**
 * Constructs a direct Upwork job search URL.
 * @param {string} userQuery The raw search query string.
 * @param {string[]} contractorTiersGraphQL Array of GQL contractor tier strings (e.g., ["IntermediateLevel", "ExpertLevel"]).
 * @param {string} sortBy Sort criteria (e.g., "recency", "relevance").
 * @returns {string} The constructed Upwork search URL.
 */
function constructUpworkSearchURL(userQuery, contractorTiersGraphQL, sortBy) {
  const baseURL = "https://www.upwork.com/nx/search/jobs/";
  const encodedQuery = encodeURIComponent(userQuery);

  const tierMap = {
    "EntryLevel": "1",
    "IntermediateLevel": "2",
    "ExpertLevel": "3"
  };

  const mappedTiers = contractorTiersGraphQL
    .map(tier => tierMap[tier])
    .filter(Boolean) // Remove undefined if a tier isn't in map
    .join(",");

  let finalURL = `${baseURL}?q=${encodedQuery}`;
  if (mappedTiers) {
    finalURL += `&contractor_tier=${mappedTiers}`;
  }
  if (sortBy) {
    finalURL += `&sort=${sortBy}`;
  }
  return finalURL;
}
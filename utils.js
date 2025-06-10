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

/**
 * Converts a date to a string like "x minutes ago".
 * @param {string|Date|number} dateInput The date to convert.
 * @returns {string} A string representing the time ago.
 */
function timeAgo(dateInput) {
  if (!dateInput) return 'N/A';
  const date = (typeof dateInput === 'string' || typeof dateInput === 'number') ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return 'Invalid Date';

  const now = new Date();
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);

  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds} sec ago`;
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} hr ago`;
  if (days === 1) return `1 day ago`;
  return `${days} days ago`;
}
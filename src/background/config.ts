/* exported config */
/**
 * Centralized configuration and constants for the Upwork Job Monitor background script.
 */

export const config = {
  UPWORK_DOMAIN: 'https://www.upwork.com',
  UPWORK_GRAPHQL_ENDPOINT_BASE: 'https://www.upwork.com/api/graphql/v1',
  TARGET_GRAPHQL_URL_PATTERN: '*://*.upwork.com/api/graphql/v1*', // For webRequest
  /**
   * X-Upwork-API-Tenant-ID header value. Currently not required for GraphQL requests
   * as only the bearer token is needed. Kept for reference in case API requirements change.
   */
  // X_UPWORK_API_TENANT_ID: '424307183201796097',

  // Default search parameters
  DEFAULT_USER_QUERY:
    'NOT "react" NOT "next.js" NOT "wix" NOT "HubSpot" NOT "Squarespace" NOT "Webflow Website" NOT "Webflow Page" NOT "Webflow Designer" NOT "Content Marketing" NOT "Guest Post" "CLS" OR "INP" OR "LCP" OR "pagespeed" OR "Page speed" OR "Shopify speed" OR "Wordpress speed" OR "site speed" OR "web vitals" OR "WebPageTest" OR "GTmetrix" OR "Lighthouse scores" OR "Google Lighthouse" OR "page load" OR "performance expert" OR "performance specialist" OR "performance audit"', // Centralized default query
  DEFAULT_CONTRACTOR_TIERS_GQL: ['IntermediateLevel', 'ExpertLevel'],
  DEFAULT_SORT_CRITERIA: 'recency',

  // Client-side title exclusion filter strings (case-insensitive)
  TITLE_EXCLUSION_STRINGS: [
    'french speaking only',
    'SEO Optimization for',
    'Prestashop Specialist',
    'Framer website',
    'Framer Developer',
    'SEO Specialist Needed for Website Optimization',
    'TikTok Shop',
    'Virtual Assistant',
    'Funnel Expert',
    'BigCommerce Developer',
    'Webflow Developer',
    'Webflow Expert',
    'Webflow SEO',
    'Squarespace Website',
    'Squarespace Blog',
    'Squarespace Developer',
    'Brand Strategist',
    'Product Page Designer',
    'Site Completion and Optimization',
    'Landing Page Developer',
    'Bilingual ENG/SPA',
    'Logo Designer',
    'Graphic Designer',
    'Full Website Redisign',
    'Logo Designer',
    'Unity Performance Specialist',
    'Specialist for TikTok',
    'Spanish Fluent',
    // Add more strings to exclude as needed
  ].map((s) => s.toLowerCase()),

  // Skills that mark a job as low-priority (case-insensitive)
  // Jobs with these skills won't trigger notifications and will be collapsed by default.
  SKILL_LOW_PRIORITY_TERMS: ['webflow', 'Squarespace', 'BigCommerce', 'Prestashop', 'WIX'].map(
    (s) => s.toLowerCase()
  ),

  // Client countries that mark a job as low-priority (case-insensitive)
  CLIENT_COUNTRY_LOW_PRIORITY: [
    'India',
    'Indonesia',
    'pakistan',
    'Bangladesh',
    'Philippines',
    'Lebanon',
    'Nigeria',
    'IND',
  ].map((s) => s.toLowerCase()),

  // Storage keys
  // Define all storage keys here as the single source of truth
  STORAGE_KEYS: {
    SEEN_JOB_IDS: 'seenJobIds',
    DELETED_JOB_IDS: 'deletedJobIds',
    MONITOR_STATUS: 'monitorStatus',
    LAST_CHECK_TIMESTAMP: 'lastCheckTimestamp',
    NEW_JOBS_IN_LAST_RUN: 'newJobsInLastRun',
    CURRENT_USER_QUERY: 'currentUserQuery',
    RECENT_FOUND_JOBS: 'recentFoundJobs',
    COLLAPSED_JOB_IDS: 'collapsedJobIds',
    UI_THEME: 'uiTheme',
    API_ENDPOINT_TOKENS: 'apiEndpointTokens',
  },

  // Other constants
  MAX_SEEN_IDS: 500, // Limit for seenJobIds storage (historical)
  MAX_DELETED_IDS: 200, // Limit for deletedJobIds storage (user-deleted)
  FETCH_ALARM_NAME: 'fetchUpworkJobsAlarm_MV2',
  FETCH_INTERVAL_MINUTES: 4, // How often to check for new jobs
  API_FETCH_COUNT: 12, // Number of jobs to fetch per API request, upwork.com website defaults to 10
};

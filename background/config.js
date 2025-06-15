/**
 * Centralized configuration and constants for the Upwork Job Monitor background script.
 */

const config = {
  UPWORK_DOMAIN: "https://www.upwork.com",
  UPWORK_GRAPHQL_ENDPOINT_BASE: "https://www.upwork.com/api/graphql/v1",
  TARGET_GRAPHQL_URL_PATTERN: "*://*.upwork.com/api/graphql/v1*", // For webRequest
  X_UPWORK_API_TENANT_ID: "424307183201796097", // This might need dynamic discovery or confirmation

  // Default search parameters
  DEFAULT_USER_QUERY: 'NOT "react" NOT "next.js" NOT "wix" NOT "HubSpot" NOT "Squarespace" NOT "Webflow Website" NOT "Webflow Page" NOT "Webflow Designer" NOT "Content Marketing" NOT "Guest Post" "CLS" OR "INP" OR "LCP" OR "pagespeed" OR "Page speed" OR "Shopify speed" OR "Wordpress speed" OR "site speed" OR "web vitals" OR "WebPageTest" OR "GTmetrix" OR "Lighthouse scores" OR "Google Lighthouse" OR "page load" OR "performance expert" OR "performance specialist" OR "performance audit"', // Centralized default query
  DEFAULT_CONTRACTOR_TIERS_GQL: ["IntermediateLevel", "ExpertLevel"],
  DEFAULT_SORT_CRITERIA: "recency",

  // Client-side title exclusion filter strings (case-insensitive)
  TITLE_EXCLUSION_STRINGS: [
    "french speaking only",
    "SEO Optimization for",
    "Prestashop Specialist",
    "Framer website",
    "SEO Specialist Needed for Website Optimization",
    "TikTok Shop",
    "Virtual Assistant",
    "Funnel Expert",
    "BigCommerce Developer",
    "Webflow Developer",
    "Webflow Expert",
    "Squarespace Website",
    "Squarespace Blog",
    "Squarespace Developer",
    "Brand Strategist",
    "Product Page Designer",
    "Site Completion and Optimization",
    "Landing Page Developer",
    "Bilingual ENG/SPA",
    "Logo Designer",
    "Graphic Designer",
    // Add more strings to exclude as needed
  ].map(s => s.toLowerCase()),

  // Skills that mark a job as low-priority (case-insensitive)
  // Jobs with these skills won't trigger notifications and will be collapsed by default.
  SKILL_LOW_PRIORITY_TERMS: [
    "webflow",
    "Squarespace",
    "BigCommerce",
    "Prestashop",
    "Framer",
    "WIX",
    "Logo Designer",
  ].map(s => s.toLowerCase()),

  // Client countries that mark a job as low-priority (case-insensitive)
  CLIENT_COUNTRY_LOW_PRIORITY: [
    "India",
    "Indonesia",
    "pakistan",
    "Bangladesh",
    "Philippines",
  ].map(s => s.toLowerCase()),

  // Storage keys
  STORAGE_KEYS: {
    SEEN_JOB_IDS: 'seenJobIds',
    DELETED_JOB_IDS: 'deletedJobIds',
    MONITOR_STATUS: 'monitorStatus',
    LAST_CHECK_TIMESTAMP: 'lastCheckTimestamp',
    NEW_JOBS_IN_LAST_RUN: 'newJobsInLastRun',
    CURRENT_USER_QUERY: 'currentUserQuery',
    RECENT_FOUND_JOBS: 'recentFoundJobs',
    COLLAPSED_JOB_IDS: 'collapsedJobIds', // Used in popup
  },

  // Other constants
  MAX_SEEN_IDS: 500, // Limit for seenJobIds storage
  MAX_DELETED_IDS: 200, // Limit for deletedJobIds storage (used in popup/storage)
  FETCH_ALARM_NAME: "fetchUpworkJobsAlarm_MV2",
  FETCH_INTERVAL_MINUTES: 3, // How often to check for new jobs
  API_FETCH_COUNT: 16, // Number of jobs to fetch per API request
};
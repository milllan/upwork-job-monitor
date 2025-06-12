# Upwork Job Monitor Chrome Extension Documentation

## Overview
The Upwork Job Monitor is a Chrome Extension that automatically monitors Upwork for new job postings matching your criteria. It runs in the background, sends notifications for new jobs, and provides a dashboard to view recent opportunities.

### Key Features
- Automatic job monitoring every 1 minute
- Customizable job search queries
- Browser notifications for new jobs
- Job filtering by title keywords
- Detailed job preview in popup
- Job tracking (seen/ignored)

## Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/your-repo/upwork-job-monitor.git
   ```
2. Open Chrome and navigate to `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extension directory
5. Pin the extension to your toolbar for easy access

## Configuration & Key Constants
Most core settings, API endpoints, default queries, and storage keys are centralized in:
- `background/config.js` (primary configuration file)

For example, the `DEFAULT_USER_QUERY` is defined within the `config` object in `background/config.js`:
```javascript
// In background/config.js, within the 'config' object:
  DEFAULT_USER_QUERY: 'NOT "react" NOT "next.js" NOT "wix" ...', // Example query
```
This value is part of the `config` object exported by `background/config.js`.

## Architecture

The extension is structured for clarity and maintainability, with all configuration and core logic centralized. There is no content script; all monitoring and API interaction is handled in the background context.

### Components

1. **Background Service Worker**
   - Location: [`background/service-worker.js`](background/service-worker.js)
   - Responsibilities:
     - Periodic job checks
     - Token management and selection (see [`UpworkAPI`](api/upwork-api.js))
     - API requests using prioritized tokens
     - Notifications
     - Storage coordination (via [`StorageManager`](storage/storage-manager.js))
     - Loads configuration from [`background/config.js`](background/config.js)

2. **Configuration**
   - Location: [`background/config.js`](background/config.js)
   - Centralizes all key constants, including `DEFAULT_USER_QUERY`, API endpoints, and storage keys.

3. **Popup Interface**
   - HTML: [`popup/popup.html`](popup/popup.html)
   - JavaScript: [`popup/popup.js`](popup/popup.js)
   - Features:
     - Current status display
     - Manual job check
     - Query customization
     - Recent jobs list

4. **Storage Manager**
   - Location: [`storage/storage-manager.js`](storage/storage-manager.js)
   - Manages:
     - Seen job IDs
     - Deleted job IDs
     - User preferences

5. **UpworkAPI**
   - Location: [`api/upwork-api.js`](api/upwork-api.js)
   - Handles:
     - Token retrieval and prioritization
     - API requests to Upwork
     - Error handling for token permissions

**Note:** The extension previously used a content script for DOM parsing, but this is no longer required. All job monitoring is performed via API calls in the background script.

### Key Algorithms
**Token Retrieval** ([`background/service-worker.js:26`](background/service-worker.js:26)):
```javascript
async function getAllPotentialApiTokens() {
  // Retrieves and prioritizes OAuth tokens from cookies
}
```

**Job Filtering** ([`background/service-worker.js:248`](background/service-worker.js:248)):
```javascript
// Applies client-side title exclusion filters
jobs = jobs.map(job => {
  if (TITLE_EXCLUSION_STRINGS.some(exclude => title.includes(exclude))) {
    return { ...job, isExcludedByTitleFilter: true };
  }
  return job;
});
```

## Usage Guide
### Popup Interface
![Popup Interface](Screenshot%202025-06-04%20151441.png)

1. **Status Display**: Shows monitoring status, last check time, and deleted jobs count
2. **Search Query**: Customize your job search parameters
3. **Manual Check**: Trigger immediate job search (refresh icon)
4. **Recent Jobs**: Lists up to 10 most recent jobs
   - Expand/collapse job details (+/- icons)
   - Remove jobs from list (× icon)

### Job Monitoring Process
1. Extension checks for new jobs every minute
2. Uses prioritized OAuth tokens for API access
3. Filters jobs based on:
   - User-defined query
   - Title exclusion list
   - Previously seen jobs
4. Sends notifications for new matching jobs
5. Updates popup with latest results

## API Reference
### GraphQL Endpoint
```javascript
const UPWORK_GRAPHQL_ENDPOINT_BASE = "https://www.upwork.com/api/graphql/v1";
```

### Job Search Query
```graphql
query UserJobSearch($requestVariables: UserJobSearchV1Request!) {
  search {
    universalSearchNuxt {
      userJobSearchV1(request: $requestVariables) {
        paging { total offset count }
        results {
          id title description relevanceEncoded applied
          ontologySkills { uid prefLabel prettyName: prefLabel }
          connectPrice
          upworkHistoryData { 
            client { 
              paymentVerificationStatus country 
              totalSpent { amount } totalFeedback 
            } 
          }
          jobTile { 
            job { 
              id ciphertext: cipherText publishTime createTime 
              jobType hourlyBudgetMin hourlyBudgetMax 
              fixedPriceAmount { amount isoCurrencyCode } 
            } 
          }
        }
      }
    }
  }
}
```

## Troubleshooting
### Common Issues
1. **No API tokens found**
   - Ensure you're logged into Upwork in Chrome
   - Verify cookies are enabled for `upwork.com`

2. **Jobs not updating**
   - Check background script console for errors
   - Verify search query syntax

3. **Notifications not showing**
   - Check Chrome notification permissions
   - Ensure extension has notification permission in manifest

### Debugging
Inspect background processes:
1. Go to `chrome://extensions`
2. Find "Upwork Job Monitor"
3. Click "service worker" to open dev tools

View extension logs in console:
```javascript
console.log("MV2: Background Script loaded - Dynamic Token Attempt.");
```

## License
MIT License - See included LICENSE file
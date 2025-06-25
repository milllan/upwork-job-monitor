# Architecture

The extension is structured for clarity and maintainability, with all configuration and core logic centralized. There is no content script; all monitoring and API interaction is handled in the background context.

## Components

1. **Background Service Worker**
   - Location: `../../background/service-worker.js`
   - Responsibilities:
     - Periodic job checks
     - Token management and selection (see `UpworkAPI`)
     - API requests using prioritized tokens
     - Notifications
     - Storage coordination (via `StorageManager`)
     - Loads configuration from `background/config.js`

2. **Configuration**
   - Location: `../../background/config.js`
   - Centralizes all key constants, including `DEFAULT_USER_QUERY`, API endpoints, and storage keys.

3. **Popup Interface**
   - HTML: `../../popup/popup.html`
   - JavaScript: `../../popup/popup.js`
   - Features:
     - Current status display
     - Manual job check
     - Query customization
     - Recent jobs list

4. **Storage Manager**
   - Location: `../../storage/storage-manager.js`
   - Manages:
     - Seen job IDs
     - Deleted job IDs
     - User preferences

5. **UpworkAPI**
   - Location: `../../api/upwork-api.js`
   - Handles:
     - Token retrieval and prioritization
     - API requests to Upwork
     - Error handling for token permissions

**Note:** The extension previously used a content script for DOM parsing, but this is no longer required. All job monitoring is performed via API calls in the background script.

## Key Algorithms
**Token Retrieval & Rotation** (in `../../api/upwork-api.js`):
The `fetchJobsWithTokenRotation` function orchestrates the authentication process. It first calls `getAllPotentialApiTokens` to scan browser cookies for all potential OAuth2 tokens, prioritizes them, and then attempts to fetch jobs with each token until one succeeds. This makes the authentication robust and automatic.

**Job Filtering & Prioritization** (in `../../background/service-worker.js`):
After jobs are fetched, the `runJobCheck` function applies several layers of client-side filtering:
1.  **Title Exclusion:** Jobs with titles containing phrases from `config.TITLE_EXCLUSION_STRINGS` are flagged and will not trigger notifications.
2.  **Low-Priority (Skills/Country):** Jobs are marked as "low-priority" if they contain skills from `config.SKILL_LOW_PRIORITY_TERMS` or originate from client countries in `config.CLIENT_COUNTRY_LOW_PRIORITY`. These jobs do not trigger notifications and appear collapsed in the UI.

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
# Job Details API: gql-query-get-auth-job-details

This document outlines the `gql-query-get-auth-job-details` GraphQL endpoint, which provides comprehensive, authenticated details about a specific job posting. This is the primary endpoint for gathering deep intelligence on a job and the client who posted it.

---

## Core API Reference

### Request

-   **Endpoint**: `https://www.upwork.com/api/graphql/v1?alias=gql-query-get-auth-job-details`
-   **Authentication**: Requires a valid user session (OAuth2 token). The request must appear as if it's coming from an authenticated user session within the browser.
-   **Key Variable**: `id` (String, required): The `ciphertext` of the job, obtained from the `userJobSearch` API results.

### High-Value Response Data

The response is a rich object containing detailed information. The most valuable sections for analysis are:

#### 1. Client Performance Metrics (`buyer.info.stats`)

This object provides a statistical overview of the client's history on Upwork.

-   `totalAssignments`: Total number of jobs the client has ever posted.
-   `hoursCount`: Total hours billed by freelancers to this client.
-   `feedbackCount`: Total number of feedback entries (reviews) given or received.
-   `score`: The client's average rating on a 1-5 scale.
-   `totalCharges.amount`: The total amount of money the client has spent on the platform.

**Use Case**: Primary vetting criteria. A high `totalCharges` and `score` with a reasonable number of `totalAssignments` indicates a high-value, experienced client.

#### 2. Historical Job Data (`buyer.workHistory`)

This is an array of past contracts, offering deep insights into the client's behavior and past projects.

-   `feedbackToClient.comment`: Freelancers' reviews of the client. These are often more candid and revealing than the client's self-description.
-   `feedback.score`: The outcome rating of past jobs. A pattern of scores below 4.0 is a significant red flag.
-   `jobInfo.title`: Titles of previous jobs, useful for understanding the client's typical needs and projects.
-   `contractorInfo.contractorName` & `contractorInfo.ciphertext`: Identifies freelancers the client has worked with, enabling competitive analysis.

**Use Case**: Detecting red flags. Look for patterns of negative feedback, abruptly ended contracts, or a history of hiring for projects that are very different from the current one.

#### 3. Job Competition Metrics (`opening.job.clientActivity`)

This object provides real-time data on the current job's application status.

-   `totalApplicants`: The number of proposals submitted so far.
-   `totalInvitedToInterview`: The number of interviews conducted.
-   `totalHired`: The number of freelancers hired for this specific job.
-   `lastBuyerActivity`: Timestamp of when the client last interacted with the job posting (e.g., viewed proposals).

**Note**: These fields often return `null` if the numbers are low (e.g., fewer than 5 proposals) to protect privacy.

**Use Case**: Application strategy. A job with 50+ applicants is highly competitive. A job with 5-10 applicants and recent `lastBuyerActivity` is an ideal target.

#### 4. Screening Questions (`opening.questions`)

An array of additional questions the client requires applicants to answer.

-   `question`: The text of the screening question.

**Use Case**: Preparation for the application process. The complexity and number of questions can indicate how serious the client is and the level of effort required to apply.

#### 5. Bid Statistics (`applicantsBidsStats`)

Provides statistics on the bids placed by other freelancers for hourly jobs.

-   `avgRateBid.amount`: The average hourly rate bid.
-   `minRateBid.amount`: The minimum hourly rate bid.
-   `maxRateBid.amount`: The maximum hourly rate bid.

**Use Case**: Pricing strategy. Helps in positioning your own bid competitively.

### Example Response

<details>
<summary>Click to view a sample JSON response</summary>

```json
{"data":{"jobAuthDetails":{"opening":{"job":{"description":"Our website is extremely slow...","clientActivity":{"lastBuyerActivity":"2025-06-21T16:49:41.912Z","totalApplicants":31,"totalHired":0,"totalInvitedToInterview":0,"numberOfPositionsToHire":1}},"questions":[]},"buyer":{"info":{"stats":{"totalAssignments":28,"hoursCount":583.5,"feedbackCount":13,"score":4.94,"totalCharges":{"amount":25158.39}}},"workHistory":[{"jobInfo":{"title":"Looking for a superstar Automations Specialist"},"contractorInfo":{"contractorName":"David V.","ciphertext":"~01e9bd71c6d6808a9d"},"feedbackToClient":null}, ...]},"applicantsBidsStats":{"avgRateBid":{"amount":28.95},"minRateBid":{"amount":5.56},"maxRateBid":{"amount":75.0}}}}}
```

</details>

---

## Project-Specific Implementation

This section describes how the **Upwork Job Monitor** extension utilizes the `gql-query-get-auth-job-details` API.

### On-Demand Analysis

-   **Trigger**: A user hovers over or selects a job item in the popup's job list.
-   **Function**: `popup.js` calls `fetchJobDetailsWithCache()`, which in turn sends a message to the background script (`service-worker.js`).
-   **Background Process**:
    1.  The background script receives the `getJobDetails` message with the job's `ciphertext`.
    2.  It calls `UpworkAPI.fetchJobDetailsWithTokenRotation(ciphertext)`.
    3.  This function uses the sticky token rotation strategy to find a valid API token and make the `gql-query-get-auth-job-details` request.
    4.  The response is returned to the popup.
-   **UI Display**:
    1.  The `JobDetails.js` component receives the detailed JSON data.
    2.  The `_prepareViewModel()` method transforms the raw API data into a display-friendly format (e.g., formatting client hours, creating "Last Active" timestamps).
    3.  The `render()` method populates the details panel in the UI with this view model.

### Caching

-   **Mechanism**: To reduce redundant API calls and improve UI responsiveness, job details are cached in the `AppState`.
-   **Storage**: `appState.state.jobDetailsCache` (a `Map`).
-   **Logic**:
    -   When a request is made, `fetchJobDetailsWithCache()` first checks this map.
    -   If a valid, non-expired entry is found, it's returned immediately.
    -   If not, a fresh API call is made, and the result is stored in the cache with a timestamp.
-   **Expiry**: The cache has a 15-minute expiry (`cacheExpiryMs` in `AppState.js`).

### Planned Future Enhancements

#### Automated Client Vetting (GitHub Issue #1)

-   **Goal**: Automatically fetch details for all new, high-priority jobs in the background to improve the quality of notifications and the main job list, saving the user time from manually vetting each client.

#### Advanced Application Scoring (GitHub Issue #2)

-   **Goal**: Create a "match score" for each job based on its detailed properties (client stats, competition metrics, etc.) to allow for sophisticated sorting and prioritization of jobs.
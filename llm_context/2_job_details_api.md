# LLM Context: Upwork Authenticated Job Details GraphQL API

This document explains the structure and key fields of the `job_details_reference.json` file. This API call is used for the **vetting and application phase**. It provides deep, authenticated information about a single job and the client who posted it. It requires the `ciphertext` of a job (retrieved from the search query) as input.

## Request Analysis

The request is sent to the endpoint `https://www.upwork.com/api/graphql/v1?alias=gql-query-get-auth-job-details`.

### Key `variables`:

-   **`id`**: The job's `ciphertext` ID.
-   **`isLoggedIn`**: Must be `true` to access the richest data. This implies the API call must be made with valid user authentication cookies.

## Response Analysis

The response contains a comprehensive profile of the job and the client.

### 1. The Job (`data.jobAuthDetails.opening`)

-   **`description`**: The full, un-truncated job description.
-   **`questions`**: An array of screening questions the client requires freelancers to answer.
-   **`clientActivity`**: Real-time stats about this specific job posting.
    -   `totalApplicants`: The current number of applicants.
    -   `lastBuyerActivity`: Timestamp of when the client last interacted with the job (e.g., viewed a proposal). A recent timestamp is a very positive sign.
    -   `totalInvitedToInterview`: How many freelancers have been invited for an interview.

### 2. The Client (`data.jobAuthDetails.buyer`)

This is the most valuable section for client vetting.

-   **`isPaymentMethodVerified`**: A primary trust signal.
-   **`info.stats`**: The client's overall platform statistics.
    -   `score`: Their average feedback rating.
    -   `feedbackCount`: The number of reviews they have.
    -   `totalCharges.amount`: Total money spent. A high number indicates a serious, high-value client.
    -   `activeAssignmentsCount`: Number of currently active contracts, indicating a tendency for long-term work.
-   **`workHistory`**: **CRITICAL INTELLIGENCE**. An array of past contracts. Each object contains:
    -   `jobInfo.title`: The title of the past project.
    -   `rate`: The rate paid for that contract (if hourly).
    -   `feedback`: The review the client left for the freelancer (score and comment).
    -   `feedbackToClient`: The review the freelancer left for the client. This is extremely valuable for understanding what it's truly like to work with them. Look for both positive and negative comments to assess risk.

### 3. The Freelancer Viewing the Job (`data.jobAuthDetails.currentUserInfo`)

-   **`qualificationsMatches`**: Shows how the current freelancer's profile matches the job's required qualifications (e.g., Job Success Score, English Level).

### 4. The Competition (`data.jobAuthDetails.applicantsBidsStats`)

-   **A SECRET WEAPON**. This data is not typically visible in the UI.
-   **`avgRateBid`, `minRateBid`, `maxRateBid`**: The average, minimum, and maximum hourly rates of all freelancers who have already applied. This provides an incredible competitive advantage for pricing a proposal. Note: This is only available for hourly jobs where applicants have submitted rates.

**Summary for LLM:** Use this API response to create a comprehensive "Client & Job Intelligence Report" for a freelancer. The goal is to answer: "Should I apply for this job, and if so, how?"
1.  **Summarize the client:** Are they high-value? (High spend, good reviews). Are they risky? (Analyze feedback in `workHistory`).
2.  **Summarize the job:** What are the key requirements from the `description` and `questions`?
3.  **Provide a competitive analysis:** What is the applicant range and activity (`clientActivity`)? What are other freelancers bidding (`applicantsBidsStats`)?
4.  **Conclude with a recommendation:** Based on all the data, provide a go/no-go recommendation and a suggested bidding strategy.
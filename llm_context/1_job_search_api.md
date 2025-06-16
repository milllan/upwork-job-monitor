# LM Context: Upwork Job Search GraphQL API. Project-Specific Implementation.

**Core API Reference:** A stable description of the generic Upwork GraphQL API endpoint. This part changes rarely.

This document explains the structure and key fields of the `job_search_reference.json` file. This API call is used for the **discovery phase** of finding jobs on Upwork. It returns a paginated list of jobs based on a search query and filters.

## Request Analysis

The request is sent to the endpoint `https://www.upwork.com/api/graphql/v1?alias=userJobSearch`.

### Key `variables`:

-   **`userQuery`**: A string representing the search keywords. It supports boolean logic (`NOT`, `OR`).
-   **`sort`**: How to order the results. `"recency"` is most common.
-   **`paging`**: Controls pagination.
    -   `offset`: The starting point of the results.
    -   `count`: The number of results to return.
-   **`contractorTier`**: Filters jobs by experience level (e.g., `IntermediateLevel`, `ExpertLevel`).

## Response Analysis

The response contains a list of jobs matching the query.

### Key `data.search.universalSearchNuxt.userJobSearchV1` fields:

-   **`paging`**: Provides metadata about the result set, including the `total` number of jobs found.
-   **`facets`**: Aggregated data for building filters in a UI. For example, `paymentVerified` shows how many of the total jobs have a verified payment method.
-   **`results`**: An array of job objects. This is the primary data.

### Key fields within a single `results` object:

-   **`id`**: The unique numerical ID of the job.
-   **`title`** and **`description`**: The job's title and a snippet of its description.
-   **`jobTile.job.ciphertext`**: **CRITICAL**. This is the encrypted ID required to fetch the full details of this specific job in the next API call.
-   **`upworkHistoryData.client`**: A high-level summary of the client for initial vetting.
    -   `paymentVerificationStatus`: A key trust signal (`"VERIFIED"` or `null`).
    -   `country`: Client's location.
    -   `totalReviews`: Number of reviews the client has received.
    -   `totalFeedback`: The client's average star rating (out of 5).
    -   `totalSpent.amount`: The total amount of money the client has spent on the platform.
-   **`jobTile.job`**: High-level details about the job itself.
    -   `jobType`: `"FIXED"` or `"HOURLY"`.
    -   `contractorTier`: The experience level the client is looking for.
    -   `totalApplicants`: The number of freelancers who have already applied.
    -   `fixedPriceAmount` or `hourlyBudgetMin`/`hourlyBudgetMax`: The client's budget for the job.

**Summary for LLM:** Use this API response to present a list of potential jobs to a freelancer. Highlight the `title`, a summary of the `description`, and the key client vetting data from `upworkHistoryData.client` to help the freelancer quickly decide which jobs are interesting enough to explore further. The most important output from this step is the job's `ciphertext`, which is the input for the next, more detailed query.
# LM Context: Upwork Job Search GraphQL API (for Upwork Job Monitor)

This document explains the structure and key fields of the `job_search_reference.json` file. This API call is the core data source for the **Upwork Job Monitor** extension's monitoring loop, executed by the `runJobCheck` function in `background/service-worker.js`.

## Request Analysis

The request uses the `userJobSearch` alias to fetch a list of recent jobs.

### Key `variables`:

- **`userQuery`**: A string representing the search keywords, defined by the user in the popup UI or defaulted from `config.DEFAULT_USER_QUERY`. This performs the initial server-side filtering.
  - **Note:** Upwork's GraphQL API imposes a strict **500-character limit** on this query string. This is why the extension has its own client-side filtering (`TITLE_EXCLUSION_STRINGS`, etc.) to allow for more complex rules than the API permits.
- **`paging.count`**: Set to fetch a batch of jobs (e.g., 50) for processing.

## Response Analysis & Usage in Extension

The response contains a list of jobs that are then processed by the extension's internal filtering and prioritization logic. Your primary task when processing this response is to act as this filtering engine.

### Key fields within a single `results` object and their specific usage:

- **`id` and `jobTile.job.ciphertext`**:
  - **Usage in Extension:** The `id` is used as the unique key to track if a job has been seen, ignored, or deleted, managed by `StorageManager`. The `ciphertext` is the crucial identifier needed to fetch full job details later on demand.

- **`title`**:
  - **Usage in Extension:** The job title is displayed in the popup. It's critically checked against the `config.TITLE_EXCLUSION_STRINGS` array. If a match is found, the job is flagged as `isExcluded` and will NOT trigger a notification.

- **`upworkHistoryData.client`**:
  - **Usage in Extension:** This object provides the high-level client data displayed in the popup UI (`country`, `totalFeedback`, `totalSpent.amount`).
  - The `country` field is checked against the `config.CLIENT_COUNTRY_LOW_PRIORITY` array. If a match is found, the job is flagged as `isLowPriority`.

- **`ontologySkills`**:
  - **Usage in Extension:** This array of skill objects is used for display. Each `prefLabel` is checked against the `config.SKILL_LOW_PRIORITY_TERMS` array. If any skill matches, the job is flagged as `isLowPriority`.

- **`jobTile.job`**:
  - **Usage in Extension:** Contains essential display data like `jobType`, `fixedPriceAmount`, or `hourlyBudgetMin`/`hourlyBudgetMax`. The `publishTime` is used to calculate and display the job's age (e.g., "19 min ago").

### LLM Task: Emulate the Extension's Processing Logic

When you receive a batch of jobs from this API, perform the following steps, mirroring the logic in `background/service-worker.js`:

1.  **Deduplicate:** For each job, check if its `id` is already in the list of seen/deleted jobs provided by `StorageManager`. If so, ignore it.
2.  **Filter (Title Exclusion):** Check if the job's `title` contains any substring from `config.TITLE_EXCLUSION_STRINGS`. If it does, mark it as excluded and do not send a notification.
3.  **Prioritize (Low-Priority Checks):**
    - Check if the client's `country` is in `config.CLIENT_COUNTRY_LOW_PRIORITY`.
    - Check if any of the job's `ontologySkills`' `prefLabel`s are in `config.SKILL_LOW_PRIORITY_TERMS`.
    - If either of these is true, mark the job as low-priority. Low-priority jobs should not trigger a notification and should be visually distinct (e.g., collapsed) in the UI.
4.  **Notify & Display:** For any new job that is NOT excluded and NOT low-priority, generate a browser notification. All new, non-excluded jobs should be formatted for display in the popup UI, showing title, budget, client stats, skills, and age.

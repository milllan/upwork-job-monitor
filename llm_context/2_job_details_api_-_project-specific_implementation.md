# LM Context: Upwork Authenticated Job Details GraphQL API (for Upwork Job Monitor). Project-Specific Implementation.

This document explains the `job_details_reference.json` file. In the **Upwork Job Monitor** extension, this API call is not part of the main monitoring loop. It is intended to be called **on-demand** when a user wants to see more details about a specific job, or as part of future "auto-vetting" features. (See GitHub Issues #1 and #2).

## Request Analysis

The request requires the `ciphertext` of a job (retrieved from the search query) as the `id` variable. It must be made with valid user authentication cookies to retrieve the richest data.

## Response Analysis & Usage in Extension (Current & Future)

Your primary task when processing this response is to act as a "Client & Job Intelligence" engine, synthesizing the data into an actionable report for the user, as planned for the future "Job Details" page.

### 1. The Job (`data.jobAuthDetails.opening`)

- **`description` & `questions`**:
  - **Future Usage:** This content will be the main body of the future "Job Details" page, giving the user the full context without leaving the popup/dashboard.
- **`clientActivity`**:
  - **Future Usage:** These real-time stats (`totalApplicants`, `lastBuyerActivity`, `totalInvitedToInterview`) are crucial for a "Competition" section on the details page. A recent `lastBuyerActivity` is a strong positive signal.

### 2. The Client (`data.jobAuthDetails.buyer`)

This data is the foundation for the planned "Client Vetting Score" (GitHub Issue #2).

- **`isPaymentMethodVerified`**:
  - **Future Usage:** A critical boolean input for the Vetting Score. `false` should heavily penalize the score.
- **`info.stats`**:
  - **Future Usage:** Core inputs for the Vetting Score.
    - `score` & `feedbackCount`: A high score over many reviews is a strong positive signal.
    - `totalCharges.amount`: High spend indicates a serious client.
    - `activeAssignmentsCount`: A high number suggests a client who builds long-term relationships.
- **`workHistory`**:
  - **Future Usage:** **CRITICAL INTELLIGENCE** for the Vetting Score. The LLM should analyze this array to:
    - **Find Green Flags:** Extract positive comments from `feedbackToClient.comment` to show the user what other freelancers love about this client.
    - **Find Red Flags:** Identify any contracts with low scores in `feedback.score` (client->freelancer) or `feedbackToClient.score` (freelancer->client). A low score from a freelancer is a particularly strong warning sign. Identify client with low hiring rates, usually means they want to get freelancer to work outside of the platform (risky).

### 3. The Competition (`data.jobAuthDetails.applicantsBidsStats`)

- **Future Usage:** **CRITICAL FOR PRICING**. This data is not shown in the normal UI and is a key feature for the extension.
- The `avgRateBid`, `minRateBid`, and `maxRateBid` will be displayed in a "Bidding Analysis" section on the "Job Details" page to help the user price their proposal competitively (GitHub Issue #1).

### LLM Task: Generate a "Client & Job Intelligence Report"

When you receive this JSON response, generate a structured report for the future "Job Details" page.

1.  **Calculate a Client Vetting Score (1-10):**
    - **Inputs:** `isPaymentMethodVerified`, `stats.score`, `stats.feedbackCount`, `stats.totalCharges.amount`.
    - **Analysis:** Analyze the `workHistory` for feedback scores. A history of consistent 5-star reviews is excellent. A single review below 4 stars is a major red flag that should lower the score significantly.
2.  **Create a "Pros & Cons" List:**
    - **Pros:** Summarize positive freelancer feedback from `workHistory`. Mention high total spend or a high feedback score.
    - **Cons:** Explicitly call out any low ratings found in `workHistory` and quote the negative feedback if available.
3.  **Provide Bidding Guidance:**
    - If `applicantsBidsStats` is available, state the min, average, and max bids clearly.
    - Advise the user: "The current bid range is $MIN to $MAX, with an average of $AVG. Position your bid accordingly."
4.  **Final Recommendation:**
    - Based on the Vetting Score and Pros/Cons, provide a final summary. Example: "Recommendation: **Apply with Confidence**. This is a top-tier client with a proven track record (Vetting Score: 9/10). Bids are currently averaging $35/hr. Consider a bid in the $40-50 range to stand out on quality."

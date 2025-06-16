# LM Context: Project-Specific Implementation

Let's dig deeper into the two powerful queries we know of.

## 1. userJobSearch

This is our entry point for finding jobs. We can modify the variables to get different results.

- **userQuery**: This is incredibly powerful. We can use boolean operators (NOT, OR) to construct very complex searches.

- **paging**: To get a full list, we can paginate by increasing the offset in increments of count (e.g., offset: 0, count: 10, then offset: 10, count: 10, etc.).

- **contractorTier**: We can filter by EntryLevel, IntermediateLevel, and ExpertLevel.

- **sort**: We are currently using recency. Other likely values are Relevance (relevance+desc), Client Spend (client_total_charge+desc), or Client Rating (client_rating+desc). We can discover more by changing the sort order on the website and observing the new GraphQL call.

### Fields to Extract for a "Chained" Request (Important!):

- **results.jobTile.job.ciphertext**: This is the key we need for our second query.

- **results.upworkHistoryData.client**: This gives us basic client info.

## 2. gql-query-get-auth-job-details

This is our deep-dive query. It uses GraphQL Fragments (the fragment ... on ... parts) to keep the main query clean.

- **Key Variable**: id. This must be the ciphertext of a job, like ~021934.....

- **Authentication**: As noted, isLoggedIn: true and valid user cookies are required to get the richest data. Without authentication, many fields will return null or be omitted.

### Rich Data Points We Are Getting:

- **buyer.info.stats**: The holy grail of client stats (totalAssignments, hoursCount, feedbackCount, score, totalCharges).

- **buyer.workHistory**: A list of past jobs, including freelancer feedback to the client (feedbackToClient.comment), which is often more candid than the client's feedback. We can even see if a job had a bad outcome (e.g., feedback.score: 2.55).

- **clientActivity**: The number of applicants, interviews, and hires for the specific job. This is crucial for deciding whether to apply. null values often mean the numbers are low (e.g., < 5 proposals).

- **questions**: The list of additional questions the client is asking in the application.

## A Potential Workflow for Data Collection

Here is the logical chain of requests for our implementation:

1. **Search for Jobs**:
   - Use the userJobSearch query with the desired keywords and filters.
   - Loop through the results, collecting the job.ciphertext for each job that interests us.

2. **Get Job & Client Details**:
   - For each job.ciphertext collected, make a request using the gql-query-get-auth-job-details query.
   - This provides detailed information about the job (e.g., screening questions) and the client's entire history (total spend, average rating, reviews from other freelancers).

3. **(Optional/Unknown) Get More Specific Client Details**:
   - If we discover a dedicated getClientProfile alias, we could use a client ID found in one of the previous steps to get even more focused information about the client, independent of a specific job posting. I don't know if this exists.

## Important Ethical and Legal Considerations

- **Terms of Service**:
  - We are interacting with an API that is not officially documented or intended for public use. This is very likely against Upwork's Terms of Service regarding scraping or automated access. We must proceed with caution, as the account could be suspended or banned if our activity is detected and deemed malicious.

- **Rate Limiting**: We must not make requests too quickly. A reasonable delay (e.g., a few seconds) between requests is wise to avoid IP-blocking.

- **Respectful Use**:
  - We are using resources on their servers. This tool is for personal analysis, not for building a large-scale, public-facing application.

- **Authentication**:
  - The fact that the most valuable query requires authentication makes this riskier. All activity is directly tied to a specific account.

This is a powerful method for gaining insights that aren't easily visible on the front end. Happy (and careful) exploring.
# LLM Context Document: Upwork Talent Profile API & Project Integration

This document has two parts:

1.  **Core API Reference:** A stable description of the generic `getDetails` GraphQL endpoint for fetching freelancer profiles.
2.  **Project-Specific Implementation:** A description of how the Upwork Job Monitor extension can leverage this API for competitive analysis and other features.

---

### Part 1: Core API Reference (`getDetails` for Talent Profiles)

This section describes the raw API endpoint for fetching a comprehensive, public-facing profile of a specific freelancer.

#### **Request**

- **Endpoint:** `https://www.upwork.com/api/graphql/v1?alias=getDetails`
- **Query Name:** `GetTalentProfile`
- **Key Variable:** `profileUrl` (String): The freelancer's unique `ciphertext` ID (e.g., `~015b528c4e0e721c2d`). This `ciphertext` is typically found in the client work history from the `jobAuthDetails` response (`contractorInfo.ciphertext`).

#### **Response**

The response returns a single `talentVPDAuthProfile` object containing a wealth of information about the freelancer.

**Key Response Objects:**

1.  **`identity`**: Basic identifiers, including the freelancer's `ciphertext`.
2.  **`profile`**: The freelancer's self-reported information.
    - `name`, `title`, `description`: The core of their personal marketing.
    - `location`: Their country and city.
    - `skills`: An array of their listed skills, ranked by proficiency.
3.  **`stats`**: A comprehensive object of their performance metrics. **This is the most valuable data.**
    - `rating`: Their Job Success Score (JSS), as a float (e.g., 4.87 corresponds to 97% JSS). Multiply by 20 for a rough percentage.
    - `totalHours`: Total hours billed on the platform.
    - `totalJobsWorked`: Total number of contracts completed.
    - `hourlyRate.node.amount`: Their listed hourly rate.
    - `totalEarnings`: The total amount of money they have earned.
    - `topRatedStatus`: Their status, e.g., `"top_rated"`, `"top_rated_plus"`.
    - `hireAgainPercentage`: The percentage of clients who would hire them again.
4.  **`employmentHistory` & `education`**: Their professional and academic background.

---

### Part 2: Project-Specific Implementation (Upwork Job Monitor)

This section describes how the **Upwork Job Monitor** can use this talent profile data. This is primarily for **Competitive Intelligence** and **Niche Research**.

#### **Use Case: Analyzing the Competition**

The primary user journey is:

1.  User analyzes a high-value client using the `jobAuthDetails` API.
2.  User sees the client previously hired "Jane D." for a similar project.
3.  User wants to know: "Who is Jane D.? What are her skills? What is her rate? How successful is she?"
4.  The extension would use Jane D.'s `ciphertext` to call this `getDetails` API and present a summary.

#### **Planned Feature: "Competitor Profile" View**

When a user clicks on a freelancer's name (e.g., in a client's work history), the extension could trigger this API call and display a modal or a new page with a "Competitor Report".

#### **LLM Task: Generate a "Freelancer Competitor Report"**

When you receive this JSON response, generate a structured report that helps the user understand a competitor's success.

1.  **Create a Profile Headline:**
    - Generate a one-sentence summary.
    - _Example:_ "Aminur R. is a **Top Rated** WordPress Speed Expert from Bangladesh who has earned over **$300,000** with an hourly rate of **$25/hr**."

2.  **Display Key Performance Indicators (KPIs):**
    - **Job Success Score:** `stats.rating * 20` (to get a percentage like 97%).
    - **Total Earnings:** `$ stats.totalEarnings`
    - **Total Jobs:** `stats.totalJobsWorked`
    - **Total Hours:** `stats.totalHours`
    - **Would Hire Again:** `stats.hireAgainPercentage %`

3.  **Analyze Profile Strategy:**
    - **Title & Niche:** Analyze `profile.title`. Is it broad or highly specific? _Example: "This freelancer has a very deep and narrow niche: 'Wordpress Speed Optimization'. This signals a successful specialization strategy."_
    - **Top 5 Skills:** List the first 5 skills from the `profile.skills` array.
    - **Pricing:** State their hourly rate and compare it to their earnings. _Example: "At $25/hr, they have achieved high earnings through a high volume of projects (1034 total jobs)."_ Show average earnings per job: `$ stats.totalEarnings` / `stats.totalJobsWorked`

4.  **Final Recommendation for User:**
    - Provide actionable advice. _Example: "To compete with this freelancer, consider narrowing your own niche. Their success demonstrates that deep expertise in a specific area is highly valued. Their profile title is also highly optimized for what clients search for."_

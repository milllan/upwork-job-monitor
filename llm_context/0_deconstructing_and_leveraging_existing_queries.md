# Deconstructing and Leveraging Upwork's GraphQL Queries

This document provides a comprehensive analysis of Upwork's GraphQL API endpoints for job discovery and detailed analysis. It serves as both a technical reference and implementation guide for the Upwork Job Monitor extension.

## Overview

The Upwork Job Monitor leverages two primary GraphQL endpoints in a chained approach:
1. **Job Discovery**: `userJobSearch` - Finds jobs matching search criteria
2. **Deep Analysis**: `gql-query-get-auth-job-details` - Retrieves comprehensive job and client data

## 1. Job Discovery API: `userJobSearch`

**Endpoint**: `https://www.upwork.com/api/graphql/v1?alias=userJobSearch`

This is the primary entry point for job discovery, used in the extension's main monitoring loop (`runJobCheck` function).

### Key Request Variables

#### `userQuery` (String, max 500 characters)
- **Purpose**: Server-side filtering using boolean operators
- **Operators**: `NOT`, `OR`, `AND` (implicit)
- **Example**: `'NOT "react" NOT "next.js" "performance" OR "pagespeed" OR "web vitals"'`
- **Limitation**: 500-character GraphQL limit (why client-side filtering is also needed)
- **Current Implementation**: Defined in `config.DEFAULT_USER_QUERY`

#### `paging` (Object)
- **Structure**: `{ offset: number, count: number }`
- **Usage**: Paginate through results (offset: 0, count: 16, then offset: 16, count: 16, etc.)
- **Current Implementation**: `count: 16` (defined in `config.API_FETCH_COUNT`)

#### `contractorTier` (Array)
- **Options**: `["EntryLevel", "IntermediateLevel", "ExpertLevel"]`
- **Current Implementation**: `["IntermediateLevel", "ExpertLevel"]` (in `config.DEFAULT_CONTRACTOR_TIERS_GQL`)

#### `sort` (String)
- **Current**: `"recency"` (most recent jobs first)
- **Alternatives**:
  - `"relevance+desc"` - Most relevant jobs
  - `"client_total_charge+desc"` - Highest spending clients
  - `"client_rating+desc"` - Highest rated clients
- **Discovery Method**: Change sort on website and inspect network requests

### Critical Response Fields for Chaining

#### `results.jobTile.job.ciphertext`
- **Purpose**: Unique job identifier required for detailed job query
- **Format**: Encrypted string (e.g., `~021934a1b2c3d4e5f6...`)
- **Usage**: Primary key for `gql-query-get-auth-job-details` API call

#### `results.upworkHistoryData.client`
- **Purpose**: Basic client information for initial filtering
- **Fields**: `paymentVerificationStatus`, `country`, `totalSpent.amount`, `totalFeedback`
- **Usage**: Client-side filtering before making detailed API calls

## 2. Detailed Job Analysis API: `gql-query-get-auth-job-details`

**Endpoint**: `https://www.upwork.com/api/graphql/v1?alias=gql-query-get-auth-job-details`

This authenticated endpoint provides comprehensive job and client intelligence. Currently used for on-demand analysis but planned for auto-vetting features (GitHub Issues #1 and #2).

### Authentication Requirements
- **Required**: Valid user session cookies
- **Required**: `isLoggedIn: true` in request
- **Risk**: All activity tied to specific user account
- **Fallback**: Many fields return `null` without proper authentication

### Key Request Variables

#### `id` (String, required)
- **Source**: `ciphertext` from `userJobSearch` results
- **Format**: Encrypted job identifier (e.g., `~021934a1b2c3d4e5f6...`)
- **Validation**: Must be exact match from job search results

### High-Value Response Data

#### `buyer.info.stats` - Client Performance Metrics
- **`totalAssignments`**: Number of jobs posted
- **`hoursCount`**: Total hours worked with freelancers
- **`feedbackCount`**: Number of reviews given/received
- **`score`**: Average client rating (1-5 scale)
- **`totalCharges.amount`**: Total money spent on platform
- **Usage**: Primary client vetting criteria

#### `buyer.workHistory` - Historical Job Data
- **`feedbackToClient.comment`**: Freelancer reviews of client (often more candid)
- **`feedback.score`**: Job outcome ratings (watch for < 4.0 scores)
- **`job.title`**: Previous job titles (pattern analysis)
- **Usage**: Red flag detection for problematic clients

#### `clientActivity` - Job Competition Metrics
- **`applicantsCount`**: Number of proposals submitted
- **`interviewsCount`**: Number of interviews conducted
- **`hiresCount`**: Number of freelancers hired
- **`null` values**: Often indicates low numbers (< 5 proposals)
- **Usage**: Application strategy optimization (crucial for deciding whether to apply). 

#### `questions` - Screening Requirements
- **Structure**: Array of additional application questions
- **Usage**: Preparation for application process
- **Analysis**: Complexity indicator for client requirements

## Implementation Workflow

### Current Extension Architecture

The Upwork Job Monitor implements a two-phase approach:

#### Phase 1: Continuous Monitoring (Automated)
**Function**: `runJobCheck()` in `background/service-worker.js`
**Frequency**: Every 3 minutes (configurable via `config.FETCH_INTERVAL_MINUTES`)
**Process**:
1. Execute `userJobSearch` with current user query
2. Apply client-side filtering (`TITLE_EXCLUSION_STRINGS`, `SKILL_LOW_PRIORITY_TERMS`)
3. Compare against seen job IDs to identify new opportunities
4. Send notifications for new matching jobs
5. Update popup display with latest results

#### Phase 2: Detailed Analysis (On-Demand)
**Trigger**: User interaction or future auto-vetting features
**Process**:
1. Collect `ciphertext` values from Phase 1 results
2. Execute `gql-query-get-auth-job-details` for selected jobs
3. Analyze client metrics and job competition data
4. Generate application recommendations

### Recommended Data Collection Workflow

#### 1. Job Discovery and Initial Filtering
```javascript
// Current implementation in UpworkAPI.fetchUpworkJobsDirectly()
const searchResults = await userJobSearch({
  userQuery: config.DEFAULT_USER_QUERY,
  paging: { offset: 0, count: config.API_FETCH_COUNT },
  contractorTier: config.DEFAULT_CONTRACTOR_TIERS_GQL,
  sort: config.DEFAULT_SORT_CRITERIA
});

// Extract ciphertext for promising jobs
const jobCiphertexts = searchResults.results
  .filter(job => passesClientSideFilters(job))
  .map(job => job.jobTile.job.ciphertext);
```

#### 2. Detailed Job and Client Analysis
```javascript
// Future implementation for auto-vetting
const detailedAnalysis = await Promise.all(
  jobCiphertexts.map(ciphertext =>
    getAuthJobDetails({ id: ciphertext })
  )
);

// Analyze results for application prioritization
const prioritizedJobs = detailedAnalysis
  .filter(job => job.buyer.info.stats.score > 4.0)
  .filter(job => job.clientActivity.applicantsCount < 10)
  .sort((a, b) => b.buyer.info.stats.totalCharges.amount - a.buyer.info.stats.totalCharges.amount);
```

#### 3. Future Enhancement: Client Profile Deep-Dive
**Status**: Exploratory (not yet implemented)
**Potential**: Dedicated `getClientProfile` endpoint for client-focused analysis
**Use Case**: Independent client research beyond specific job postings

## Technical Implementation Details

### Rate Limiting and Request Management
**Current Strategy**: Token rotation with fallback mechanisms
**Implementation**: `UpworkAPI.fetchJobsWithTokenRotation()`
**Safeguards**:
- 3-minute intervals between automated checks
- Token validation before requests
- Graceful degradation on API failures
- Error logging for debugging

### Authentication Token Management
**Source**: Browser cookies from authenticated Upwork session
**Method**: `getAllPotentialApiTokens()` extracts OAuth tokens
**Rotation**: Multiple tokens attempted on failure
**Security**: Tokens never stored persistently

### Error Handling and Resilience
**GraphQL Errors**: Logged and handled gracefully
**Network Failures**: Automatic retry with different tokens
**Authentication Issues**: Fallback to basic data extraction
**Rate Limiting**: Exponential backoff (future enhancement)

## Risk Assessment and Mitigation

### Legal and Ethical Considerations

#### Terms of Service Compliance
- **Risk Level**: High - Using undocumented internal APIs
- **Mitigation**: Personal use only, respectful request patterns
- **Monitoring**: Account suspension risk if detected as malicious

#### Rate Limiting and Server Resources
- **Current Protection**: 3-minute intervals, limited batch sizes
- **Recommendation**: Consider implementing exponential backoff
- **Best Practice**: Monitor for 429 (Too Many Requests) responses

#### Authentication and Account Security
- **Risk**: All activity tied to specific user account
- **Mitigation**: Use extension only with personal accounts
- **Warning**: Avoid commercial or client accounts

#### Data Privacy and Storage
- **Current**: Minimal local storage, no external transmission
- **Compliance**: GDPR-friendly (local processing only)
- **Recommendation**: Clear data retention policies

### Operational Guidelines

1. **Personal Use Only**: Never deploy for commercial scraping
2. **Respectful Patterns**: Maintain reasonable request intervals
3. **Monitor Health**: Watch for API changes or blocking
4. **Account Safety**: Use dedicated development accounts when possible
5. **Graceful Degradation**: Handle API failures without breaking functionality

## Future Development Opportunities

### Planned Enhancements (GitHub Issues)
- **Issue #1**: Auto-vetting based on client metrics
- **Issue #2**: Advanced filtering and scoring algorithms
- **Issue #3**: Client reputation tracking over time

### API Discovery Opportunities
- **Client Profile Endpoint**: Dedicated client analysis API
- **Advanced Search Filters**: Additional GraphQL variables
- **Real-time Updates**: WebSocket or polling optimizations

### Performance Optimizations
- **Caching Strategy**: Store client data to reduce API calls
- **Batch Processing**: Group multiple job detail requests
- **Predictive Filtering**: ML-based job relevance scoring

---

**Note**: This implementation provides powerful insights into Upwork's job market while maintaining ethical boundaries. Always prioritize account safety and respectful API usage.
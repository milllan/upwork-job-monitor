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
   git clone https://github.com/milllan/upwork-job-monitor.git
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

Upwork GraphQL limits the user query to 500 characters max!
This value is part of the `config` object exported by `background/config.js`.

### Customizing Job Filters

One of the features is the ability to further customize the job filters (beyond the 500 char limit for the GraphQL query). You can do this by editing the arrays within the `config` object in `background/config.js`:

- **`TITLE_EXCLUSION_STRINGS`**: Add any string to this array to completely hide jobs whose titles contain that string. This is for jobs you _never_ want to see.
  ```javascript
  // Example: To also exclude jobs mentioning "SEO"
  TITLE_EXCLUSION_STRINGS: ["french speaking only", "SEO Optimization for", ...],
  ```
- **`SKILL_LOW_PRIORITY_TERMS`**: Add skills here (e.g., "webflow", "wix") to mark jobs with these skills as low-priority. They will still appear in your list but won't send notifications and will be collapsed by default.
- **`CLIENT_COUNTRY_LOW_PRIORITY`**: Add countries here (e.g., "India", "Pakistan") to mark jobs from these locations as low-priority.

After editing `config.js`, you must reload the extension from the `chrome://extensions` page for the changes to take effect.

## Usage Guide

### Popup Interface

![Popup Interface](https://github.com/milllan/upwork-job-monitor/assets/198157/e615e4f4-5555-4675-81e0-745a70992348)

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
console.log('MV2: Background Script loaded - Dynamic Token Attempt.');
```

## License

MIT License - See included LICENSE file

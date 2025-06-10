# Upwork Job Monitor Chrome Extension

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/your-extension-id?color=blue&label=Chrome%20Web%20Store)](https://chrome.google.com/webstore/detail/your-extension-id)

## Overview
The Upwork Job Monitor is a Chrome Extension that automatically monitors Upwork for new job postings matching your criteria. It runs in the background, sends notifications for new jobs, and provides a dashboard to view recent opportunities.

**Architecture Note:**
All monitoring and API interaction is handled in the background script using configuration from [`background/config.js`](background/config.js). There is no content script; all job fetching is performed via API calls. See [User Guide](USER_GUIDE.md#architecture) for details.

![Popup Interface](Screenshot%202025-06-04%20151441.png)

## Key Features
- Automatic job monitoring every 1 minute
- Customizable job search queries
- Browser notifications for new jobs
- Job filtering by title keywords
- Detailed job preview in popup
- Job tracking (seen/ignored)

## Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/your-repo/upwork-job-monitor.git
   ```
2. Open Chrome and navigate to `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extension directory
5. Pin the extension to your toolbar for easy access

## Usage
For detailed usage instructions, see the [User Guide](USER_GUIDE.md).

## Documentation
- [User Guide](USER_GUIDE.md) - Installation, usage, and troubleshooting
- [Component Documentation](USER_GUIDE.md#architecture) - Technical architecture details
- [API Reference](USER_GUIDE.md#api-reference) - GraphQL API specifications
- [Development Plan](DEVELOPMENT_PLAN.md) - Original project planning documentation

## License
MIT License - See [LICENSE](LICENSE) file
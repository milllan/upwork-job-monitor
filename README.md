# Upwork Job Monitor Browser Extension (Chrome Extension / Firefox Extension)

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/your-extension-id?color=blue&label=Chrome%20Web%20Store)](https://chrome.google.com/webstore/detail/your-extension-id)

## Overview

The Upwork Job Monitor is a browser extension (Chrome/Firefox) that monitors Upwork job feeds for new opportunities matching your user-defined criteria. It bypasses Cloudflare protection by operating within your authenticated browser session, making it appear as legitimate user activity rather than automated bot traffic.

![Popup Interface](Screenshot%202025-06-15%20225010.png)

## Key Features

- **Automatic Monitoring:** Checks for new Upwork jobs every **3 minutes**.
- **Direct API Fetching:** Uses Upwork's GraphQL API to fetch jobs directly from the background script.
- **Persistent Authentication:** Authenticates using OAuth tokens automatically extracted from your browser cookies.
- **Customizable Filtering:** Supports user-defined search queries and client-side filtering to prioritize jobs.
- **Desktop Notifications:** Provides native browser notifications for new, high-priority jobs.
- **Popup Dashboard:** Includes a rich popup interface to view recent jobs, manage your query, and check status.

## Technical Details

- **Manifest V2:** Built as a Manifest V2 extension to leverage persistent background scripts and the `webRequestBlocking` API.
- **Token Rotation:** Implements a robust token rotation system to find a valid authentication token for making API calls.
- **No Content Scripts:** All API interaction happens in the background, making the extension more stable and less prone to breaking from Upwork UI changes.
- **Centralized Logic:**
  - Configuration is centralized in `background/config.js`.
  - All storage interactions are handled by `storage/storage-manager.js`.
  - API logic is encapsulated in `api/upwork-api.js`.

## Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/milllan/upwork-job-monitor.git
    ```
2.  Open Chrome/Firefox and navigate to the extensions page (`chrome://extensions` or `about:debugging`).
3.  Enable "Developer mode".
4.  Click "Load unpacked" and select the cloned extension directory.
5.  Pin the extension to your toolbar for easy access.

## Usage

For detailed usage instructions, see the [**User Guide**](USER_GUIDE.md).

## Documentation

- [User Guide](USER_GUIDE.md) - Installation, usage, and troubleshooting.
- [Component Documentation](USER_GUIDE.md#architecture) - Technical architecture details.
- [Development Plan](DEVELOPMENT_PLAN.md) - Original project planning documentation.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
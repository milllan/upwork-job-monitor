# Upwork Job Monitor Browser Extension (Chrome Extension / Firefox Extension)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

The Upwork Job Monitor is a browser extension (Chrome/Firefox) that monitors Upwork job feeds for new opportunities matching your user-defined criteria. It bypasses Cloudflare protection by operating within your authenticated browser session, making it appear as legitimate user activity rather than automated bot traffic.

![Popup Interface](https://github.com/milllan/upwork-job-monitor/assets/198157/e615e4f4-5555-4675-81e0-745a70992348)

## Key Features

- **Automatic Monitoring:** Checks for new Upwork jobs every **3 minutes**.
- **Direct API Fetching:** Uses Upwork's GraphQL API to fetch jobs directly from the background script.
- **Persistent Authentication:** Authenticates using OAuth tokens automatically extracted from your browser cookies.
- **Customizable Filtering:** Supports user-defined search queries and client-side filtering to prioritize jobs.
- **Desktop Notifications:** Provides native browser notifications for new, high-priority jobs.
- **Popup Dashboard:** Includes a rich popup interface to view recent jobs, manage your query, and check status.

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
For detailed usage instructions, see the [**User Guide**](docs/1-user/guide.md).

## Documentation

- [User Guide](docs/1-user/guide.md) - Installation, usage, and troubleshooting.
- [Developer Documentation](docs/2-developer/01-architecture.md) - Technical architecture, API reference, and development process.
- [Archived Development Plan](docs/4-archive/original-development-plan.md) - Original project planning documentation.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
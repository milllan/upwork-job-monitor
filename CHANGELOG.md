# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2024-07-17

### Added

- Initial release of the Upwork Job Monitor extension.
- Background monitoring of Upwork job feeds using direct GraphQL API calls.
- Dynamic OAuth2 token extraction and rotation for persistent authentication.
- Popup UI for viewing recent jobs, managing search queries, and checking status.
- Client-side filtering for excluding jobs by title and marking jobs as low-priority based on skills or client country.
- On-demand fetching of detailed job and client intelligence for the details panel.
- Component-based UI architecture with a central state manager (`AppState`).
- Complete refactoring and organization of project documentation into a clear, hierarchical structure.

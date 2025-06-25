# Architecture

## High-Level Overview

The extension is structured for clarity and maintainability, with all configuration and core logic centralized. There is no content script; all monitoring and API interaction is handled in the background context, making it robust and less prone to breakage from website UI changes.

## Core Components

1. **Background Service Worker (`background/service-worker.js`)**
   - Location: `background/service-worker.js`
   - Responsibilities:
     - Periodic job checks
     - Token management and selection (see `UpworkAPI`)
     - API requests using prioritized tokens
     - Notifications
     - Storage coordination (via `StorageManager`)
     - Dispatches messages to dedicated handlers (Command Handler pattern).
     - Loads configuration from `background/config.js`

2. **Configuration**
   - Location: `background/config.js`
   - Centralizes all key constants, including `DEFAULT_USER_QUERY`, API endpoints, and storage keys.

3. **Popup Interface**
   - HTML: `popup/popup.html`
   - JavaScript: `popup/popup.js` (Orchestrator)
   - Features:
     - Current status display
     - Manual job check
     - Query customization
     - Recent jobs list
   - **Architecture**: The popup is built using a modern component-based architecture, orchestrated by `popup.js` and managed by a central state object, `AppState`. Components are designed to be "dumb" renderers, receiving data from `AppState` and emitting events for user interactions. Its key components include `StatusHeader.js`, `SearchForm.js`, `JobItem.js`, and `JobDetails.js`.

4. **Service Layer (`popup/services/ApiService.js`)**
    - **Location**: `popup/services/ApiService.js`
    - **Responsibilities**:
        - Encapsulates all `browser.runtime.sendMessage` calls to the background script.
        - Decouples the UI components from the implementation details of background communication.
        - Manages the caching logic for data fetched from the background (e.g., job details).
        - Exposes a clean, promise-based API for the rest of the popup to use (e.g., `apiService.fetchJobDetails()`).

5. **Storage Manager**
   - Location: `storage/storage-manager.js`
   - Manages:
     - Seen job IDs
     - Deleted job IDs
     - User preferences

6. **UpworkAPI**
   - Location: `api/upwork-api.js`
   - Handles:
     - Token retrieval and prioritization
     - API requests to Upwork
     - Error handling for token permissions

## Architectural Principles & Patterns

### Component-Based Architecture

The project's UI is built using a component-based architecture with a central state manager (`AppState`). This approach promotes separation of concerns, reusability, and maintainability.

-   **Component Identification**: Each distinct UI element (e.g., `JobItem`, `JobDetails`, `StatusHeader`, `SearchForm`) is encapsulated in its own component class.
-   **State-Driven UI**: All UI updates in response to state changes **must** be handled by `AppState` subscribers that call component methods (e.g., `.update()`). Direct DOM manipulation from the main `popup.js` script is forbidden for elements managed by components.
-   **Unidirectional Data Flow**: Data flows from `AppState` to the components. User interactions within a component trigger callbacks that execute actions on `AppState`, which in turn updates the state and causes the relevant components to re-render.

### Standard Component Structure

All UI components should follow a standard class structure to ensure consistency:

-   `constructor(data, options)`: Initializes the component with its data and an `options` object for callbacks.
-   `render()`: The public method that creates and returns the component's fully populated DOM element.
-   `_prepareViewModel()`: A private method that transforms raw data into a display-ready object.
-   `_attachEventListeners()`: A private method to set up all DOM event listeners.
-   `update(newData, newOptions)`: A public method to update the component with new data and re-render.
-   `destroy()`: A public method to clean up the component and its event listeners.

### ViewModel (VM) Pattern

The ViewModel pattern is used to separate data preparation from rendering logic.

-   **ViewModel Responsibility**: The `_prepareViewModel()` method is responsible for transforming raw data into a display-ready object. This ViewModel should primarily contain *data* (strings, numbers, booleans, arrays of data). It can also contain pre-formatted HTML snippets for simple cases.
-   **Render Method Responsibility**: The public `render()` method should be a "dumb" function that only maps the ViewModel to the DOM. It should contain minimal conditional logic.
-   **Template Interaction**: Components should primarily interact with their HTML templates using `data-field` and `data-section` attributes. These attributes serve as stable hooks for populating content and controlling section visibility, decoupling JavaScript from specific HTML tag names or complex DOM structures.
-   **Declarative Rendering**: For visibility, prefer toggling CSS classes (e.g., `.hidden`) based on ViewModel properties rather than direct `element.style.display` manipulation. This centralizes visual control in CSS.

### Application Bootstrap (`popup.js`)

The `DOMContentLoaded` listener in `popup.js` serves as the application's primary **orchestrator**. Its role is strictly limited to:

1.  Initializing the central `AppState` manager.
2.  Instantiating the `ApiService` to handle all background communication.
3.  Instantiating all top-level UI components (`StatusHeader`, `SearchForm`, `JobItem`, `JobDetails`).
4.  Connecting components to `AppState` by setting up subscribers.
5.  Setting up global event listeners that trigger actions on `AppState`.

The `popup.js` file should **avoid** containing any direct DOM manipulation, data formatting, or complex business logic for component-managed elements.

### General Utilities & Styling

-   **`utils.js`**: Place general utility and formatting functions that are not tied to a specific component's internal state (e.g., `timeAgo`, `formatBudget`) in `utils.js`. These functions should be pure and reusable.
-   **CSS Variables**: When making styling changes, always check for existing CSS variables (defined in `:root`) for consistency. New CSS variables should be defined within the `:root` selector to ensure proper theming.

## Key Algorithms
**Token Retrieval & Rotation** (in `api/upwork-api.js`):
The `fetchJobsWithTokenRotation` function orchestrates the authentication process. It first calls `getAllPotentialApiTokens` to scan browser cookies for all potential OAuth2 tokens, prioritizes them, and then attempts to fetch jobs with each token until one succeeds. This makes the authentication robust and automatic.

**Job Filtering & Prioritization** (in `background/service-worker.js`):
After jobs are fetched, the `runJobCheck` function applies several layers of client-side filtering:
1.  **Title Exclusion:** Jobs with titles containing phrases from `config.TITLE_EXCLUSION_STRINGS` are flagged and will not trigger notifications.
2.  **Low-Priority (Skills/Country):** Jobs are marked as "low-priority" if they contain skills from `config.SKILL_LOW_PRIORITY_TERMS` or originate from client countries in `config.CLIENT_COUNTRY_LOW_PRIORITY`. These jobs do not trigger notifications and appear collapsed in the UI.

## API Reference
For detailed information on the GraphQL endpoints used by this extension, please see the API Documentation.
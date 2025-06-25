# Architecture

## High-Level Overview

The extension is structured for clarity and maintainability, with all configuration and core logic centralized. There is no content script; all monitoring and API interaction is handled in the background context, making it robust and less prone to breakage from website UI changes.

## Core Components

1.  **Background Service Worker (`background/service-worker.js`)**
    *   **Location:** `background/service-worker.js`
    *   **Responsibilities:**
        *   Periodic job checks via `browser.alarms`.
        *   Token management and selection (see `UpworkAPI`).
        *   API requests using prioritized tokens.
        *   Sending browser notifications for new jobs.
        *   Storage coordination (via `StorageManager`).
        *   Dispatches incoming messages to dedicated handlers (Command Handler pattern).
        *   Loads configuration from `background/config.js`.

2.  **Configuration (`background/config.js`)**
    *   **Location:** `background/config.js`
    *   **Responsibilities:** Centralizes all key constants, including `DEFAULT_USER_QUERY`, API endpoints, filtering rules, and storage keys.

3.  **Popup Interface**
    *   **HTML:** `popup/popup.html`
    *   **JavaScript Orchestrator:** `popup/popup.js`
    *   **Features:**
     - Current status display
     - Manual job check
     - Query customization
     - Recent jobs list
    *   **Architecture:** The popup is built using a modern component-based architecture orchestrated by `popup.js` and managed by a central state object, `AppState`. Components are designed to be "dumb" renderers, receiving data from `AppState` and emitting events for user interactions. Its key components include `StatusHeader.js`, `SearchForm.js`, `JobItem.js`, and `JobDetails.js`.

4.  **Service Layer (`popup/services/ApiService.js`)**
    *   **Location:** `popup/services/ApiService.js`
    *   **Responsibilities:**
        *   Encapsulates all `browser.runtime.sendMessage` calls to the background script.
        *   Decouples the UI components from the implementation details of background communication.
        *   Manages the caching logic for data fetched from the background (e.g., job details).
        *   Exposes a clean, promise-based API for the rest of the popup to use (e.g., `apiService.fetchJobDetails()`).

5.  **Storage Manager (`storage/storage-manager.js`)**
    *   **Location:** `storage/storage-manager.js`
    *   **Responsibilities:** Provides a clean facade over `browser.storage.local`, managing seen job IDs, deleted job IDs, and user preferences.

6.  **Upwork API Module (`api/upwork-api.js`)**
    *   **Location:** `api/upwork-api.js`
    *   **Responsibilities:**
        *   Handles all direct interaction with the Upwork GraphQL API.
        *   Contains the logic for token retrieval from cookies and the token rotation strategy.
        *   Handles GraphQL payload construction and error handling.

## Architectural Principles & Patterns

### Architectural Choice: Component-Based with State Management

The extension's UI is built on a modern, component-based architecture with a centralized state manager (`AppState`). This approach was chosen for several key reasons over alternatives like pure MVVM or a monolithic script:

*   **Maintainability**: Each component has a single, clear purpose (Single Responsibility Principle). This makes debugging easier as issues are isolated to specific components.
*   **Testability**: Components can be unit-tested in isolation, and services can be easily mocked. The centralized, predictable state makes UI testing more reliable.
*   **Incremental Migration**: This architecture was implemented gradually from a more monolithic `popup.js` without requiring a full rewrite, demonstrating its flexibility.
*   **Developer Experience**: The clear file structure and smaller, focused modules reduce cognitive load and accelerate the development of new features.

While other patterns like MVVM or a more traditional MVC were considered, the lightweight component model was deemed the best fit for the scale and event-driven nature of a browser extension popup.

### Component-Based Architecture

The project's UI is built using a component-based architecture with a central state manager (`AppState`). This approach promotes separation of concerns, reusability, and maintainability.

*   **Component Identification**: Each distinct UI element (e.g., `JobItem`, `JobDetails`, `StatusHeader`, `SearchForm`) is encapsulated in its own component class.
*   **State-Driven UI**: All UI updates in response to state changes **must** be handled by `AppState` subscribers that call component methods (e.g., `.update()`). Direct DOM manipulation from the main `popup.js` script is forbidden for elements managed by components.
*   **Unidirectional Data Flow**: Data flows from `AppState` to the components. User interactions within a component trigger callbacks that execute actions on `AppState`, which in turn updates the state and causes the relevant components to re-render.

### Standard Component Structure

All UI components follow a standard class structure to ensure consistency:

*   `constructor(data, options)`: Initializes the component with its data and an `options` object for callbacks.
*   `render()`: The public method that creates and returns the component's fully populated DOM element.
*   `_prepareViewModel()`: A private method that transforms raw data into a display-ready object.
*   `_attachEventListeners()`: A private method to set up all DOM event listeners.
*   `update(newData, newOptions)`: A public method to update the component with new data and re-render.
*   `destroy()`: A public method to clean up the component and its event listeners.

### ViewModel (VM) Pattern

The ViewModel pattern is used to separate data preparation from rendering logic.

*   **ViewModel Responsibility**: The `_prepareViewModel()` method is responsible for transforming raw data into a display-ready object. This ViewModel should primarily contain *data* (strings, numbers, booleans, arrays of data). It can also contain pre-formatted HTML snippets for simple cases.
*   **Render Method Responsibility**: The public `render()` method should be a "dumb" function that only maps the ViewModel to the DOM. It should contain minimal conditional logic.
*   **Template Interaction**: Components should primarily interact with their HTML templates using `data-field` and `data-section` attributes. These attributes serve as stable hooks for populating content and controlling section visibility, decoupling JavaScript from specific HTML tag names or complex DOM structures.
*   **Declarative Rendering**: For visibility, prefer toggling CSS classes (e.g., `.hidden`) based on ViewModel properties rather than direct `element.style.display` manipulation. This centralizes visual control in CSS.

### Application Bootstrap (`popup.js`)

The `DOMContentLoaded` listener in `popup.js` serves as the application's primary **orchestrator**. Its role is strictly limited to:

1.  Initializing the central `AppState` manager.
2.  Instantiating the `ApiService` to handle all background communication.
3.  Instantiating all top-level UI components (`StatusHeader`, `SearchForm`, `JobItem`, `JobDetails`).
4.  Connecting components to `AppState` by setting up subscribers.
5.  Setting up global event listeners that trigger actions on `AppState`.

The `popup.js` file should **avoid** containing any direct DOM manipulation, data formatting, or complex business logic for component-managed elements.

### General Utilities & Styling

*   **`utils.js`**: Place general utility and formatting functions that are not tied to a specific component's internal state (e.g., `timeAgo`, `formatBudget`) in `utils.js`. These functions should be pure and reusable.
*   **CSS Variables**: When making styling changes, always check for existing CSS variables (defined in `:root`) for consistency. New CSS variables should be defined within the `:root` selector to ensure proper theming.

## Key Algorithms

**Token Retrieval & Rotation** (in `api/upwork-api.js`):
The `fetchJobsWithTokenRotation` function orchestrates the authentication process. It first calls `getAllPotentialApiTokens` to scan browser cookies for all potential OAuth2 tokens, prioritizes them, and then attempts to fetch jobs with each token until one succeeds. This makes the authentication robust and automatic.

**Job Filtering & Prioritization** (in `background/service-worker.js`):
After jobs are fetched, the `runJobCheck` function applies several layers of client-side filtering:
1.  **Title Exclusion:** Jobs with titles containing phrases from `config.TITLE_EXCLUSION_STRINGS` are flagged and will not trigger notifications.
2.  **Low-Priority (Skills/Country):** Jobs are marked as "low-priority" if they contain skills from `config.SKILL_LOW_PRIORITY_TERMS` or originate from client countries in `config.CLIENT_COUNTRY_LOW_PRIORITY`. These jobs do not trigger notifications and appear collapsed in the UI.

## API Reference

For detailed information on the GraphQL endpoints used by this extension, please see the API Documentation.
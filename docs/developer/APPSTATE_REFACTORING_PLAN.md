# AppState Refactoring Plan

## Current State Management Analysis

### Current State Variables in popup.js
```javascript
// Scattered state variables (lines 23-38)
let collapsedJobIds = new Set();           // UI state - collapsed job items
let deletedJobIds = new Set();             // UI state - user-deleted jobs
let currentlySelectedJobId = null;         // UI state - selected job for details
let jobItemComponents = new Map();         // Component instances
let currentTheme = 'light';                // UI state - theme preference

// Consolidated popup state object (lines 30-34)
const popupState = {
  monitorStatusText: 'Initializing...',    // Status display
  lastCheckTimestamp: null,                // Last check time
  deletedJobsCount: 0                      // Count for UI display
};

// Caching state (lines 36-38)
const jobDetailsCache = new Map();        // Job details cache
const CACHE_EXPIRY_MS = 15 * 60 * 1000;   // Cache expiry time
```

### Current Storage Interactions
- **Load**: `loadStoredData()` - Loads 7 different storage keys
- **Save**: Multiple individual save functions (`saveCollapsedState`, `saveDeletedState`)
- **Sync**: Storage change listener for cross-tab synchronization

### Current State Update Patterns
1. **Direct mutation** of global variables
2. **Partial updates** via `updateConsolidatedStatusDisplay()`
3. **Manual synchronization** between memory and storage
4. **Event-driven updates** from background script

## Refactoring Progress and Decisions

### Completed Refactoring
- **✅ Centralized State:** All UI and data state has been successfully migrated from scattered global variables into the central `AppState.js` manager.
- **✅ Component Extraction:** The main UI has been broken down into discrete components (`StatusHeader.js`, `JobItem.js`, `JobDetails.js`, `SearchForm.js`).
- **✅ Service Layer:** Data fetching and background communication logic has been extracted from `popup.js` into a dedicated service layer (`popup/services/ApiService.js`).

### Deferred Refactoring (Pragmatic Pauses)

After review, the following refactoring steps from the original plan have been intentionally deferred to avoid over-engineering at the project's current scale. They can be revisited if the codebase grows significantly in complexity.

-   **`StatePersistence.js`:** The persistence logic is currently simple and well-contained within `AppState.js`. The benefit of an extra abstraction layer is minimal at this stage.
-   **`StateActions.js`:** The current state-mutating methods in `AppState.js` are straightforward. Separating them would add complexity without a clear benefit.
-   **Splitting `utils.js`:** The `utils.js` file is small and cohesive. It does not yet warrant being split into multiple smaller files.

## Refactoring Strategy: Incremental Migration

### Phase 1: Create AppState Foundation (Low Risk) - COMPLETE
**Goal**: Establish AppState without breaking existing functionality

### Phase 2: Migrate Core UI State (Medium Risk) - COMPLETE
**Goal**: Move main UI state to AppState

### Phase 3: Advanced State Management (Medium Risk) - COMPLETE
**Goal**: Add reactive updates and optimize performance

## Implementation Details

### AppState.js Structure
```javascript
class AppState {
  constructor() {
    this.state = {
      // UI State
      theme: 'light',
      selectedJobId: null,
      collapsedJobIds: new Set(),
      deletedJobIds: new Set(),
      
      // Status State
      monitorStatus: 'Initializing...',
      lastCheckTimestamp: null,
      
      // Job Data
      jobs: [],
      jobDetailsCache: new Map(),
      
      // Component State
      jobComponents: new Map()
    };
    
    this.listeners = new Set();
    // Persistence and actions remain as internal methods for now.
  }
}
```

### File Structure After Refactoring
```
popup/
├── popup.js                    # Main entry point (simplified orchestrator)
├── state/
│   └── AppState.js             # Central state management
├── components/
│   ├── JobItem.js
│   ├── JobDetails.js
│   ├── StatusHeader.js
│   └── SearchForm.js           # ✅ Extracted
└── services/
    └── ApiService.js           # ✅ Extracted (replaces JobService/BackgroundService)
```

## Risk Mitigation

The incremental migration was successful. Each step was tested individually, and the current architecture is stable.

## Success Metrics

- [x] All UI state centralized in AppState.
- [x] Storage operations simplified via AppState.
- [x] State updates are predictable and debuggable.
- [x] UI is now almost entirely reactive and state-driven.
- [x] `popup.js` has been significantly simplified.
- [x] Code is more maintainable and testable.
```
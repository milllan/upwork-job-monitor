# Refactoring Examples

This document contains examples of refactoring from a procedural style to a more modern, component-based, and state-managed architecture.

---

## Example 1: From Procedural to Component-Based

### Before: Procedural Approach (popup.js)

```javascript
// Current approach - procedural with mixed concerns
function _populateJobItemElement(element, vm, isCollapsed) {
  // 40+ lines of DOM manipulation
  element.querySelector('[data-field="budget"]').textContent = vm.budget;
  element.querySelector('[data-field="client-info"]').innerHTML = vm.clientInfo;
  // ... more DOM manipulation
  element.classList.toggle('job-item--collapsed', isCollapsed);
  // ... more class management
}

function createJobItemElement(job, isInitiallyCollapsed) {
  const clone = jobItemTemplate.content.cloneNode(true);
  const jobItemElement = clone.querySelector('.job-item');
  const vm = _prepareJobViewModel(job);
  _populateJobItemElement(jobItemElement, vm, isInitiallyCollapsed);
  return jobItemElement;
}

// Event handling scattered throughout the file
recentJobsListDiv.addEventListener('click', (event) => {
  const jobItemElement = event.target.closest('.job-item');
  if (!jobItemElement) return;
  
  const jobId = jobItemElement.dataset.jobId;
  const toggleButton = event.target.closest('.job-item__toggle');
  const deleteButton = event.target.closest('.job-item__delete-btn');
  
  if (toggleButton && jobId) {
    // Toggle logic here
  } else if (deleteButton && jobId) {
    // Delete logic here
  }
});
```

### After: Component-Based Approach

#### 1. Using the JobItem Component

```javascript
// In popup.js - much cleaner and focused
class PopupApp {
  constructor() {
    this.jobComponents = new Map(); // Track job components
    this.collapsedJobIds = new Set();
    this.deletedJobIds = new Set();
  }

  displayRecentJobs(jobs = []) {
    const jobsToDisplay = jobs.filter(job => 
      job && job.id && !this.deletedJobIds.has(job.id)
    );

    // Clear existing components
    this.jobComponents.forEach(component => component.destroy());
    this.jobComponents.clear();

    const fragment = document.createDocumentFragment();

    jobsToDisplay.forEach(job => {
      const jobComponent = new JobItem(job, {
        isCollapsed: this.collapsedJobIds.has(job.id),
        onToggle: (jobId, isCollapsed) => this.handleJobToggle(jobId, isCollapsed),
        onDelete: (jobId) => this.handleJobDelete(jobId),
        onSelect: (ciphertext) => this.handleJobSelect(ciphertext)
      });

      this.jobComponents.set(job.id, jobComponent);
      fragment.appendChild(jobComponent.render());
    });

    this.recentJobsListDiv.replaceChildren(fragment);
  }

  handleJobToggle(jobId, isCollapsed) {
    if (isCollapsed) {
      this.collapsedJobIds.add(jobId);
    } else {
      this.collapsedJobIds.delete(jobId);
    }
    this.saveCollapsedState();
  }

  handleJobDelete(jobId) {
    const component = this.jobComponents.get(jobId);
    if (component) {
      component.destroy();
      this.jobComponents.delete(jobId);
    }
    
    this.deletedJobIds.add(jobId);
    this.saveDeletedState();
    
    if (jobId === this.currentlySelectedJobId) {
      this.clearDetailsPanel();
    }
  }

  handleJobSelect(ciphertext) {
    this.updateDetailsPanel(ciphertext);
  }
}
```

#### 2. State Management Example

```javascript
// popup/state/AppState.js
class AppState {
  constructor() {
    this.state = {
      jobs: [],
      collapsedJobIds: new Set(),
      deletedJobIds: new Set(),
      selectedJobId: null,
      monitorStatus: 'Initializing...',
      lastCheckTimestamp: null,
      currentTheme: 'light'
    };
    this.listeners = new Set();
  }

  // Subscribe to state changes
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Update state and notify listeners
  setState(updates) {
    const prevState = { ...this.state };
    this.state = { ...this.state, ...updates };
    
    this.listeners.forEach(listener => {
      listener(this.state, prevState);
    });
  }

  // Getters for specific state
  getJobs() { return this.state.jobs; }
  getCollapsedJobIds() { return this.state.collapsedJobIds; }
  getSelectedJobId() { return this.state.selectedJobId; }
  
  // Actions
  toggleJobCollapse(jobId) {
    const collapsedJobIds = new Set(this.state.collapsedJobIds);
    if (collapsedJobIds.has(jobId)) {
      collapsedJobIds.delete(jobId);
    } else {
      collapsedJobIds.add(jobId);
    }
    this.setState({ collapsedJobIds });
  }

  deleteJob(jobId) {
    const deletedJobIds = new Set(this.state.deletedJobIds);
    deletedJobIds.add(jobId);
    
    const jobs = this.state.jobs.filter(job => job.id !== jobId);
    
    this.setState({ 
      jobs, 
      deletedJobIds,
      selectedJobId: this.state.selectedJobId === jobId ? null : this.state.selectedJobId
    });
  }
}
```

#### 3. Service Layer Example

```javascript
// popup/services/JobService.js
class JobService {
  constructor(appState) {
    this.appState = appState;
    this.jobDetailsCache = new Map();
  }

  async loadJobs() {
    try {
      const jobs = await StorageManager.getRecentFoundJobs();
      this.appState.setState({ jobs });
      return jobs;
    } catch (error) {
      console.error('JobService: Error loading jobs:', error);
      throw error;
    }
  }

  async fetchJobDetails(ciphertext) {
    // Check cache first
    const cached = this.jobDetailsCache.get(ciphertext);
    if (cached && (Date.now() - cached.timestamp < 15 * 60 * 1000)) {
      return cached.data;
    }

    // Fetch from background
    try {
      const response = await browser.runtime.sendMessage({
        action: "getJobDetails",
        jobCiphertext: ciphertext
      });

      if (response?.jobDetails) {
        this.jobDetailsCache.set(ciphertext, {
          data: response.jobDetails,
          timestamp: Date.now()
        });
        return response.jobDetails;
      }
      throw new Error(response?.error || "Failed to fetch job details");
    } catch (error) {
      console.error('JobService: Error fetching job details:', error);
      throw error;
    }
  }

  async triggerJobCheck(query) {
    try {
      const response = await browser.runtime.sendMessage({
        action: "manualCheck",
        userQuery: query
      });
      return response;
    } catch (error) {
      console.error('JobService: Error triggering job check:', error);
      throw error;
    }
  }
}
```

### Benefits of This Approach

1. **Separation of Concerns**
- **JobItem**: Handles individual job rendering and interactions
- **AppState**: Manages application state
- **JobService**: Handles data operations
- **PopupApp**: Orchestrates components and services

2. **Easier Testing**
```javascript
// Easy to unit test components
describe('JobItem', () => {
  it('should render job title correctly', () => {
    const jobData = { id: '1', title: 'Test Job' };
    const jobItem = new JobItem(jobData);
    const element = jobItem.render();
    
    expect(element.querySelector('.job-item__title').textContent).toBe('Test Job');
  });

  it('should call onToggle when toggle button is clicked', () => {
    const onToggle = jest.fn();
    const jobItem = new JobItem({ id: '1' }, { onToggle });
    const element = jobItem.render();
    
    element.querySelector('.job-item__toggle').click();
    
    expect(onToggle).toHaveBeenCalledWith('1', true);
  });
});
```

3. **Better Maintainability**
- Each component has a single responsibility
- Changes to job item rendering only affect the JobItem component
- State changes are predictable and centralized
- Easy to add new features without touching existing code

4. **Improved Developer Experience**
- Smaller, focused files are easier to understand
- Clear interfaces between components
- Easier to debug issues
- Better code reuse opportunities

### Migration Strategy

1. **Start with JobItem** - Replace `_populateJobItemElement` with the JobItem component
2. **Add State Management** - Gradually move state to AppState
3. **Extract Services** - Move business logic to service classes
4. **Create More Components** - Break down other large functions into components

This approach maintains all existing functionality while making the code much more maintainable and testable.

---
---

## Example 2: Migrating Theme State to AppState

This shows exactly how to migrate the theme state from the current popup.js to AppState.

### Current Code (popup.js lines 27, 63-77)

```javascript
// Current global variable
let currentTheme = 'light'; // Default state, will be updated from storage

// Current setTheme function
function setTheme(theme) {
  if (!themeStylesheet || !themeToggleButton) return;

  if (theme === 'dark') {
    themeStylesheet.href = 'popup-dark.css';
    themeToggleButton.textContent = '☀️'; // Sun icon for switching to light mode
    themeToggleButton.title = "Switch to Light Mode";
  } else { // Default to light
    themeStylesheet.href = 'popup.css';
    themeToggleButton.textContent = '🌙'; // Moon icon for switching to dark mode
    themeToggleButton.title = "Switch to Dark Mode";
  }
  currentTheme = theme;
  StorageManager.setUiTheme(theme);
}

// Current theme toggle event listener (line 509-512)
themeToggleButton.addEventListener('click', () => {
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  setTheme(newTheme);
});

// Current theme loading in loadStoredData (line 453)
setTheme(loadedTheme); // Apply the theme
```

### After Migration

#### Step 1: Add AppState to popup.html

```html
<!-- In popup.html, add before popup.js -->
<script src="state/AppState.js"></script>
<script src="popup.js"></script>
```

#### Step 2: Initialize AppState in popup.js

```javascript
// Add at the top of DOMContentLoaded, after DOM element selection
document.addEventListener('DOMContentLoaded', async () => {
  // ... existing DOM element selection ...
  
  // Initialize AppState
  const appState = new AppState();
  await appState.loadFromStorage();
  
  // Remove this line:
  // let currentTheme = 'light';
  
  // ... rest of the code ...
```

#### Step 3: Update setTheme function

```javascript
// Replace the current setTheme function with:
function setTheme(theme) {
  if (!themeStylesheet || !themeToggleButton) return;

  // Update AppState (this will trigger persistence automatically)
  appState.setTheme(theme);
  
  // Update UI based on AppState
  updateThemeUI();
}

// New function to update UI based on AppState
function updateThemeUI() {
  const theme = appState.getTheme();
  
  if (theme === 'dark') {
    themeStylesheet.href = 'popup-dark.css';
    themeToggleButton.textContent = '☀️';
    themeToggleButton.title = "Switch to Light Mode";
  } else {
    themeStylesheet.href = 'popup.css';
    themeToggleButton.textContent = '🌙';
    themeToggleButton.title = "Switch to Dark Mode";
  }
}
```

#### Step 4: Update theme toggle event listener

```javascript
// Replace the current event listener with:
themeToggleButton.addEventListener('click', () => {
  const currentTheme = appState.getTheme();
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  setTheme(newTheme);
});
```

#### Step 5: Update loadStoredData function

```javascript
// In loadStoredData, replace:
// setTheme(loadedTheme);

// With:
updateThemeUI(); // Theme is already loaded in AppState
```

#### Step 6: Add reactive theme updates (Optional)

```javascript
// Add after AppState initialization for automatic UI updates
appState.subscribeToSelector('theme', (newTheme, prevTheme) => {
  console.log(`Theme changed from ${prevTheme} to ${newTheme}`);
  updateThemeUI();
});
```

### Complete Migrated Code

```javascript
document.addEventListener('DOMContentLoaded', async () => {
  // DOM element selection (unchanged)
  const popupTitleLinkEl = document.querySelector('.app-header__title');
  const themeToggleButton = document.getElementById('theme-toggle-button');
  const themeStylesheet = document.getElementById('theme-stylesheet');
  // ... other elements ...

  // Initialize AppState
  const appState = new AppState();
  await appState.loadFromStorage();

  // Theme management functions
  function updateThemeUI() {
    const theme = appState.getTheme();
    
    if (!themeStylesheet || !themeToggleButton) return;
    
    if (theme === 'dark') {
      themeStylesheet.href = 'popup-dark.css';
      themeToggleButton.textContent = '☀️';
      themeToggleButton.title = "Switch to Light Mode";
    } else {
      themeStylesheet.href = 'popup.css';
      themeToggleButton.textContent = '🌙';
      themeToggleButton.title = "Switch to Dark Mode";
    }
  }

  function setTheme(theme) {
    appState.setTheme(theme);
    updateThemeUI();
  }

  // Event listeners
  themeToggleButton.addEventListener('click', () => {
    const currentTheme = appState.getTheme();
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  });

  // Reactive updates (optional)
  appState.subscribeToSelector('theme', () => {
    updateThemeUI();
  });

  // Initial UI setup
  updateThemeUI();

  // ... rest of existing code unchanged ...
});
```

### Testing This Migration

1. **Load the extension** - Should work exactly as before
2. **Toggle theme** - Should switch between light/dark
3. **Close and reopen popup** - Theme should persist
4. **Check console** - Should see AppState logs
5. **No errors** - Browser console should be clean

### Benefits After This Step

1. **Theme state is centralized** in AppState
2. **Automatic persistence** - No manual StorageManager calls
3. **Reactive updates** - UI updates automatically
4. **Better debugging** - State changes are logged
5. **Foundation for next steps** - AppState is ready for more state

### What's Removed

- ❌ `let currentTheme = 'light';` global variable
- ❌ `StorageManager.setUiTheme(theme);` manual call
- ❌ Direct theme variable access

### What's Added

- ✅ `appState.getTheme()` getter
- ✅ `appState.setTheme(theme)` setter
- ✅ `updateThemeUI()` function
- ✅ Automatic state persistence
- ✅ Optional reactive updates

This migration is **low risk** because:
- Theme state is isolated
- No complex dependencies
- Easy to test and verify
- Easy to rollback if needed

After this step works, you can proceed to migrate the next state variable (selectedJobId).
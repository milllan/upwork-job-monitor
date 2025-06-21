# Migration Step 1: Theme State Example

This shows exactly how to migrate the theme state from the current popup.js to AppState.

## Current Code (popup.js lines 27, 63-77)

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

## After Migration

### Step 1: Add AppState to popup.html

```html
<!-- In popup.html, add before popup.js -->
<script src="state/AppState.js"></script>
<script src="popup.js"></script>
```

### Step 2: Initialize AppState in popup.js

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

### Step 3: Update setTheme function

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

### Step 4: Update theme toggle event listener

```javascript
// Replace the current event listener with:
themeToggleButton.addEventListener('click', () => {
  const currentTheme = appState.getTheme();
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  setTheme(newTheme);
});
```

### Step 5: Update loadStoredData function

```javascript
// In loadStoredData, replace:
// setTheme(loadedTheme);

// With:
updateThemeUI(); // Theme is already loaded in AppState
```

### Step 6: Add reactive theme updates (Optional)

```javascript
// Add after AppState initialization for automatic UI updates
appState.subscribeToSelector('theme', (newTheme, prevTheme) => {
  console.log(`Theme changed from ${prevTheme} to ${newTheme}`);
  updateThemeUI();
});
```

## Complete Migrated Code

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

## Testing This Migration

1. **Load the extension** - Should work exactly as before
2. **Toggle theme** - Should switch between light/dark
3. **Close and reopen popup** - Theme should persist
4. **Check console** - Should see AppState logs
5. **No errors** - Browser console should be clean

## Benefits After This Step

1. **Theme state is centralized** in AppState
2. **Automatic persistence** - No manual StorageManager calls
3. **Reactive updates** - UI updates automatically
4. **Better debugging** - State changes are logged
5. **Foundation for next steps** - AppState is ready for more state

## What's Removed

- ❌ `let currentTheme = 'light';` global variable
- ❌ `StorageManager.setUiTheme(theme);` manual call
- ❌ Direct theme variable access

## What's Added

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

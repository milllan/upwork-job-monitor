/**
 * AppState - Centralized state management for the Upwork Job Monitor popup
 * 
 * This class manages all application state and provides a reactive system
 * for UI updates. It replaces the scattered state variables in popup.js
 * with a centralized, predictable state management system.
 */

class AppState {
  constructor() {
    // Initialize state with default values
    this.state = {
      // UI State
      theme: 'light',
      selectedJobId: null,
      collapsedJobIds: new Set(),
      deletedJobIds: new Set(),
      
      // Status State  
      monitorStatus: 'Initializing...',
      lastCheckTimestamp: null,
      currentUserQuery: '',
      
      // Job Data
      jobs: [],
      jobDetailsCache: new Map(),
      
      // Component State
      jobComponents: new Map(),
      
      // Cache Configuration
      cacheExpiryMs: 15 * 60 * 1000 // 15 minutes
    };
    
    // Subscription system for reactive updates
    this.listeners = new Set();
    this.selectorListeners = new Map(); // For specific state slice subscriptions
    
    // State persistence helper
    this.persistence = null; // Will be set after StatePersistence is loaded
    
    // Debounced save to prevent excessive storage writes
    this.debouncedSave = this._debounce(this._saveToStorage.bind(this), 300);
  }

  // === Core State Management ===

  /**
   * Get the current state (read-only)
   * @returns {Object} Current state object
   */
  getState() {
    return { ...this.state };
  }

  /**
   * Update state and notify listeners
   * @param {Object} updates - Partial state updates
   * @param {Object} options - Update options
   */
  setState(updates, options = {}) {
    const prevState = { ...this.state };
    
    // Handle Set objects properly
    const processedUpdates = this._processStateUpdates(updates);
    
    // Apply updates
    this.state = { ...this.state, ...processedUpdates };
    
    // Notify listeners
    this._notifyListeners(this.state, prevState);
    
    // Auto-save to storage unless disabled
    if (!options.skipPersistence) {
      this.debouncedSave();
    }
    
    console.log('AppState: State updated', { updates, newState: this.state });
  }

  /**
   * Subscribe to state changes
   * @param {Function} listener - Callback function (newState, prevState) => void
   * @returns {Function} Unsubscribe function
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Subscribe to specific state slice changes
   * @param {string} selector - State property name
   * @param {Function} listener - Callback function (newValue, prevValue) => void
   * @returns {Function} Unsubscribe function
   */
  subscribeToSelector(selector, listener) {
    if (!this.selectorListeners.has(selector)) {
      this.selectorListeners.set(selector, new Set());
    }
    this.selectorListeners.get(selector).add(listener);
    
    return () => {
      const listeners = this.selectorListeners.get(selector);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.selectorListeners.delete(selector);
        }
      }
    };
  }

  // === State Getters ===

  getTheme() { return this.state.theme; }
  getSelectedJobId() { return this.state.selectedJobId; }
  getCollapsedJobIds() { return new Set(this.state.collapsedJobIds); }
  getDeletedJobIds() { return new Set(this.state.deletedJobIds); }
  getMonitorStatus() { return this.state.monitorStatus; }
  getLastCheckTimestamp() { return this.state.lastCheckTimestamp; }
  getCurrentUserQuery() { return this.state.currentUserQuery; }
  getJobs() { return [...this.state.jobs]; }
  getJobComponents() { return new Map(this.state.jobComponents); }

  // Computed properties
  getDeletedJobsCount() { return this.state.deletedJobIds.size; }
  getVisibleJobs() { 
    return this.state.jobs.filter(job => !this.state.deletedJobIds.has(job.id));
  }

  // === State Actions ===

  /**
   * Set the current theme
   * @param {string} theme - 'light' or 'dark'
   */
  setTheme(theme) {
    if (theme !== 'light' && theme !== 'dark') {
      console.warn('AppState: Invalid theme', theme);
      return;
    }
    this.setState({ theme });
  }

  /**
   * Set the selected job ID
   * @param {string|null} jobId - Job ID or null to clear selection
   */
  setSelectedJobId(jobId) {
    this.setState({ selectedJobId: jobId });
  }

  /**
   * Toggle job collapsed state
   * @param {string} jobId - Job ID to toggle
   */
  toggleJobCollapse(jobId) {
    const collapsedJobIds = new Set(this.state.collapsedJobIds);
    if (collapsedJobIds.has(jobId)) {
      collapsedJobIds.delete(jobId);
    } else {
      collapsedJobIds.add(jobId);
    }
    this.setState({ collapsedJobIds });
  }

  /**
   * Delete a job (add to deleted list)
   * @param {string} jobId - Job ID to delete
   */
  deleteJob(jobId) {
    const deletedJobIds = new Set(this.state.deletedJobIds);
    deletedJobIds.add(jobId);
    
    // Clear selection if deleting selected job
    const selectedJobId = this.state.selectedJobId === jobId ? null : this.state.selectedJobId;
    
    this.setState({ deletedJobIds, selectedJobId });
  }

  /**
   * Update monitor status
   * @param {string} status - New status text
   * @param {number|null} timestamp - Optional timestamp
   */
  updateMonitorStatus(status, timestamp = null) {
    const updates = { monitorStatus: status };
    if (timestamp !== null) {
      updates.lastCheckTimestamp = timestamp;
    }
    this.setState(updates);
  }

  /**
   * Set jobs data
   * @param {Array} jobs - Array of job objects
   */
  setJobs(jobs) {
    this.setState({ jobs: [...jobs] });
  }

  /**
   * Set current user query
   * @param {string} query - Search query string
   */
  setCurrentUserQuery(query) {
    this.setState({ currentUserQuery: query });
  }

  // === Job Details Cache Management ===

  /**
   * Get cached job details
   * @param {string} ciphertext - Job ciphertext
   * @returns {Object|null} Cached data or null if not found/expired
   */
  getCachedJobDetails(ciphertext) {
    const cached = this.state.jobDetailsCache.get(ciphertext);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp >= this.state.cacheExpiryMs) {
      // Remove expired cache
      const jobDetailsCache = new Map(this.state.jobDetailsCache);
      jobDetailsCache.delete(ciphertext);
      this.setState({ jobDetailsCache }, { skipPersistence: true });
      return null;
    }
    
    return cached.data;
  }

  /**
   * Cache job details
   * @param {string} ciphertext - Job ciphertext
   * @param {Object} data - Job details data
   */
  setCachedJobDetails(ciphertext, data) {
    const jobDetailsCache = new Map(this.state.jobDetailsCache);
    jobDetailsCache.set(ciphertext, {
      data,
      timestamp: Date.now()
    });
    this.setState({ jobDetailsCache }, { skipPersistence: true });
  }

  // === Component Management ===

  /**
   * Register a job component
   * @param {string} jobId - Job ID
   * @param {Object} component - Component instance
   */
  setJobComponent(jobId, component) {
    const jobComponents = new Map(this.state.jobComponents);
    jobComponents.set(jobId, component);
    this.setState({ jobComponents }, { skipPersistence: true });
  }

  /**
   * Unregister a job component
   * @param {string} jobId - Job ID
   */
  removeJobComponent(jobId) {
    const jobComponents = new Map(this.state.jobComponents);
    jobComponents.delete(jobId);
    this.setState({ jobComponents }, { skipPersistence: true });
  }

  // === Persistence ===

  /**
   * Load state from storage
   * @returns {Promise<void>}
   */
  async loadFromStorage() {
    try {
      const [
        theme,
        collapsedJobIds,
        deletedJobIds,
        monitorStatus,
        lastCheckTimestamp,
        currentUserQuery,
        jobs
      ] = await Promise.all([
        StorageManager.getUiTheme(),
        StorageManager.getCollapsedJobIds(),
        StorageManager.getDeletedJobIds(),
        StorageManager.getMonitorStatus(),
        StorageManager.getLastCheckTimestamp(),
        StorageManager.getCurrentUserQuery(),
        StorageManager.getRecentFoundJobs()
      ]);

      this.setState({
        theme,
        collapsedJobIds: new Set(collapsedJobIds),
        deletedJobIds: new Set(deletedJobIds),
        monitorStatus,
        lastCheckTimestamp,
        currentUserQuery: currentUserQuery || config.DEFAULT_USER_QUERY,
        jobs
      }, { skipPersistence: true });

      console.log('AppState: State loaded from storage');
    } catch (error) {
      console.error('AppState: Error loading from storage:', error);
    }
  }

  // === Private Methods ===

  /**
   * Process state updates to handle special types like Sets
   * @private
   */
  _processStateUpdates(updates) {
    const processed = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value instanceof Set) {
        processed[key] = new Set(value);
      } else if (value instanceof Map) {
        processed[key] = new Map(value);
      } else {
        processed[key] = value;
      }
    }
    return processed;
  }

  /**
   * Notify all listeners of state changes
   * @private
   */
  _notifyListeners(newState, prevState) {
    // Notify general listeners
    this.listeners.forEach(listener => {
      try {
        listener(newState, prevState);
      } catch (error) {
        console.error('AppState: Error in state listener:', error);
      }
    });

    // Notify selector-specific listeners
    this.selectorListeners.forEach((listeners, selector) => {
      const newValue = newState[selector];
      const prevValue = prevState[selector];
      
      if (newValue !== prevValue) {
        listeners.forEach(listener => {
          try {
            listener(newValue, prevValue);
          } catch (error) {
            console.error(`AppState: Error in selector listener for ${selector}:`, error);
          }
        });
      }
    });
  }

  /**
   * Save state to storage (debounced)
   * @private
   */
  async _saveToStorage() {
    try {
      await Promise.all([
        StorageManager.setUiTheme(this.state.theme),
        StorageManager.setCollapsedJobIds(Array.from(this.state.collapsedJobIds)),
        StorageManager.setDeletedJobIds(Array.from(this.state.deletedJobIds)),
        StorageManager.setCurrentUserQuery(this.state.currentUserQuery)
      ]);
    } catch (error) {
      console.error('AppState: Error saving to storage:', error);
    }
  }

  /**
   * Debounce utility
   * @private
   */
  _debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AppState;
} else {
  window.AppState = AppState;
}

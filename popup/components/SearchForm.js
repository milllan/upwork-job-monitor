/**
 * SearchForm Component
 * Manages the search query input and the save/check button.
 */
class SearchForm {
  constructor(containerElement, onSearch) {
    if (!containerElement) {
      throw new Error('SearchForm component requires a container element.');
    }
    this.container = containerElement;
    this.onSearch = onSearch;

    this.inputEl = this.container.querySelector('.query-section__input');
    this.buttonEl = this.container.querySelector('.query-section__button');

    if (!this.inputEl || !this.buttonEl) {
      throw new Error('SearchForm requires an input and a button with specific classes.');
    }

    this._attachEventListeners();
  }

  /**
   * Sets the value of the search input field.
   * @param {string} query - The query string to display.
   */
  setQuery(query) {
    if (this.inputEl) {
      this.inputEl.value = query || '';
    }
  }

  /**
   * Gets the current value from the search input field.
   * @returns {string} The trimmed query string.
   */
  getQuery() {
    return this.inputEl ? this.inputEl.value.trim() : '';
  }

  /**
   * Attaches event listeners to the input and button.
   * @private
   */
  _attachEventListeners() {
    this.buttonEl.addEventListener('click', () => this._handleSearch());
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {this._handleSearch();}
    });
  }

  /**
   * Handles the search action, validates input, and calls the callback.
   * @private
   */
  _handleSearch() {
    const query = this.getQuery();
    if (query && typeof this.onSearch === 'function') {
      this.onSearch(query);
    } else if (!query) {
      alert("Please enter a search query.");
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SearchForm;
} else {
  window.SearchForm = SearchForm;
}
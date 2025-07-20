export class SearchForm {
  private container: HTMLElement;
  private onSearch: (query: string) => void;
  private inputEl: HTMLInputElement;
  private buttonEl: HTMLButtonElement;

  constructor(containerElement: HTMLElement, onSearch: (query: string) => void) {
    if (!containerElement) {
      throw new Error('SearchForm component requires a container element.');
    }
    this.container = containerElement;
    this.onSearch = onSearch;
    const inputEl = this.container.querySelector('.query-section__input');
    const buttonEl = this.container.querySelector('.query-section__button');
    if (!(inputEl instanceof HTMLInputElement)) {
      throw new Error('SearchForm requires an input element with class .query-section__input');
    }
    if (!(buttonEl instanceof HTMLButtonElement)) {
      throw new Error('SearchForm requires a button element with class .query-section__button');
    }
    this.inputEl = inputEl;
    this.buttonEl = buttonEl;

    this._attachEventListeners();
  }

  setQuery(query: string): void {
    this.inputEl.value = query || '';
  }

  getQuery(): string {
    return this.inputEl.value.trim();
  }

  private _attachEventListeners(): void {
    this.buttonEl.addEventListener('click', () => this._handleSearch());
    this.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        this._handleSearch();
      }
    });
  }

  private _handleSearch(): void {
    const query = this.getQuery();
    if (query && typeof this.onSearch === 'function') {
      this.onSearch(query);
    } else if (!query) {
      alert('Please enter a search query.');
    }
  }
}

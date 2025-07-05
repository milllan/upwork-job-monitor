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

    this.inputEl = this.container.querySelector('.query-section__input') as HTMLInputElement;
    this.buttonEl = this.container.querySelector('.query-section__button') as HTMLButtonElement;

    if (!this.inputEl || !this.buttonEl) {
      throw new Error('SearchForm requires an input and a button with specific classes.');
    }

    this._attachEventListeners();
  }

  setQuery(query: string): void {
    if (this.inputEl) {
      this.inputEl.value = query || '';
    }
  }

  getQuery(): string {
    return this.inputEl ? this.inputEl.value.trim() : '';
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

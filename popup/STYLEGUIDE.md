# BEM Style Guide for Upwork Job Monitor

This document outlines the BEM (Block, Element, Modifier) conventions used in this project. Adhering to this guide ensures a consistent, maintainable, and scalable CSS architecture.

## Core Principles

- **Block**: A standalone, reusable component (e.g., `app-header`, `job-list`).
- **Element**: A part of a block that has no standalone meaning (e.g., `app-header__title`). Elements are delimited with two underscores (`__`).
- **Modifier**: A flag on a block or element used to change its appearance or behavior (e.g., `btn--primary`). Modifiers are delimited with two hyphens (`--`).

Class names are the *only* selectors used for styling. We avoid tag names, IDs, and deep nesting to keep CSS specificity low and predictable. JavaScript hooks also use these BEM classes instead of IDs.

## Component Library

### `app-header`

The main header for the popup UI.

- **Block**: `.app-header`
- **Elements**:
    - `.app-header__title`: The main title link.
    - `.app-header__meta`: A container for status information.
    - `.app-header__status`: The text displaying the current monitor status.
    - `.app-header__button`: The manual refresh button.

**Example:**
```html
<header class="app-header">
  <a class="app-header__title" href="#">Upwork Job Monitor</a>
  <div class="app-header__meta">
    <p class="app-header__status">Initializing status...</p>
    <button class="app-header__button btn btn--icon" title="Check Now">&#x21BB;</button>
  </div>
</header>
```

---

### Layout Blocks

These blocks structure the main layout of the popup.

#### `main-content`

- **Block**: `.main-content`

#### `job-list`

- **Block**: `.job-list`
- **Elements**:
    - `.job-list__no-jobs`: The message shown when the list is empty.

#### `details-panel`

- **Block**: `.details-panel`
- **Elements**:
    - `.details-panel__no-jobs`: The message shown when no job is selected.
    - `.details-panel__loading`: The "Loading..." text indicator.
    - `.details-panel__error`: The error message text.
    - `.details-panel__stats-group`: A container for a group of stats (e.g., Client Info, Job Activity).
    - `.details-panel__stat`: A single stat lozenge within a stats group.
    - `.details-panel__bids`: The container for bid statistics.
    - `.details-panel__questions`: The container for screening questions.
    - `.details-panel__description`: The container for the main job description.
    - `.details-panel__description-content`: The pre-formatted block holding the description text.

---

### `query-section`

The section containing the user's search query input and save button.

- **Block**: `.query-section`
- **Elements**:
    - `.query-section__input`: The text input field.
    - `.query-section__button`: The save/search button.

**Example:**
```html
<div class="query-section">
  <input type="text" class="query-section__input" placeholder="Enter Upwork search query...">
  <button class="query-section__button btn btn--icon btn--muted" title="Save & Check">&#x1F50D;</button>
</div>
```

---

### `btn`

A generic, reusable button component. It can be modified for different appearances and contexts.

- **Block**: `.btn`
- **Modifiers**:
    - `.btn--icon`: Styles for an icon-only button (adjusts font-size, padding).
    - `.btn--muted`: A muted color scheme for secondary actions.
    - `.btn--primary`: A primary call-to-action button with a background color.

**Examples:**
```html
<!-- Default Icon Button -->
<button class="btn btn--icon">&#x21BB;</button>

<!-- Muted Icon Button -->
<button class="btn btn--icon btn--muted">&#x1F50D;</button>

<!-- Primary Text Button -->
<button class="btn btn--primary">Save</button>
```

---

## Future Components

As we continue the refactoring, new components will be added here. The next major component to be refactored is the `job-item`, which will have its own set of elements (e.g., `job-item__title`, `job-item__details`) and modifiers (e.g., `job-item--selected`, `job-item--low-priority`).

---

### `job-item`

Represents a single job entry in the list. It has several elements for its content and modifiers for its various states.

- **Block**: `.job-item`
- **Elements**:
    - `.job-item__header`: Container for the top row (toggle, title, delete).
    - `.job-item__toggle`: The `+` / `-` button to expand/collapse details.
    - `.job-item__title-container`: The `<h3>` element wrapping the title and associated icons/tags.
    - `.job-item__applied-icon`: The checkmark icon for applied jobs.
    - `.job-item__priority-tag`: The tag for "Filtered", "Skill", or country-based low priority jobs.
    - `.job-item__title`: The `<a>` link containing the job title.
    - `.job-item__delete-btn`: The `×` button to remove the job from the list.
    - `.job-item__details`: The collapsible container for job details.
    - `.job-item__meta`: A generic paragraph for a line of detail (e.g., budget, client info).
    - `.job-item__unverified-icon`: The warning icon for unverified clients.
    - `.job-item__client-spent`: The text showing client spend. Has a `--positive` modifier for high-spending clients.
    - `.job-item__skills`: The paragraph for skills.
- **Modifiers**:
    - `.job-item--selected`: Applied on selection to highlight the item. It adds a subtle overlay, preserving any underlying status colors (like for low-priority jobs). The same effect is applied on hover.
    - `.job-item--collapsed`: Applied when the details are hidden.
    - `.job-item--low-priority`: For jobs marked by skill or country.
    - `.job-item--excluded`: For jobs filtered out by title.
    - `.job-item--applied`: For jobs the user has applied to.
    - `.job-item--high-rating`: For jobs from clients with a high rating.

**Example:**
```html
<div class="job-item job-item--collapsed job-item--low-priority" data-job-id="~01abc...">
  <div class="job-item__header">
    <span class="job-item__toggle">+</span>
    <h3 class="job-item__title-container">
      <span class="job-item__priority-tag">Skill</span>
      <a href="..." target="_blank" class="job-item__title">Low Priority Job Title...</a>
    </h3>
    <span class="job-item__delete-btn">×</span>
  </div>
  <div class="job-item__details">
    <p class="job-item__meta"><strong>Budget:</strong> 1000 USD</p>
    <p class="job-item__meta">Client: United States | Rating: 4.95 | <span class="job-item__client-spent job-item__client-spent--positive">$10k+</span><span class="job-item__unverified-icon">⚠️</span></p>
    <p class="job-item__skills">Skills: Skill 1, Skill 2</p>
    <p class="job-item__meta"><small>Posted: 10:30 AM, 1/1/2024 <b>(2 hours ago)</b></small></p>
  </div>
</div>
```

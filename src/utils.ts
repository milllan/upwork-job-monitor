/* exported constructUpworkSearchURL, timeAgo, formatClientInfo, formatSkills, formatBudget, initializeScrollHints */
// utils.ts
import { Job, Tier } from './types.js';

/**
 * A robust querySelector utility that throws an error if the element is not found.
 * @param selector The CSS selector to find.
 * @param scope The parent element or document to search within.
 * @returns The found element.
 * @throws If the element is not found.
 */
export function $<T extends HTMLElement>(selector: string, scope: Document | HTMLElement = document): T {
  const element = scope.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Element with selector "${selector}" not found.`);
  }
  return element;
}

/**
 * Constructs a direct Upwork job search URL.
 * @param {string} userQuery The raw search query string.
 * @param {Tier[]} contractorTiersGraphQL Array of GQL contractor tier strings (e.g., ["IntermediateLevel", "ExpertLevel"]).
 * @param {string} sortBy Sort criteria (e.g., "recency", "relevance").
 * @returns {string} The constructed Upwork search URL.
 */
function constructUpworkSearchURL(userQuery: string, contractorTiersGraphQL: Tier[], sortBy: string): string {
  const baseURL = 'https://www.upwork.com/nx/search/jobs/';
  const encodedQuery = encodeURIComponent(userQuery);

  const tierMap: Readonly<Record<Tier, string>> = {
    EntryLevel: '1',
    IntermediateLevel: '2',
    ExpertLevel: '3',
  } as const;

  const mappedTiers = contractorTiersGraphQL
    .map((tier) => tierMap[tier])
    .filter(Boolean) // Remove undefined if a tier isn't in map
    .join(',');

  let finalURL = `${baseURL}?q=${encodedQuery}`;
  if (mappedTiers) {
    finalURL += `&contractor_tier=${mappedTiers}`;
  }
  if (sortBy) {
    finalURL += `&sort=${sortBy}`;
  }
  return finalURL;
}

/**
 * Converts a date to a string like "x minutes ago".
 * @param {string|Date|number} dateInput The date to convert.
 * @returns {string} A string representing the time ago.
 */
function timeAgo(dateInput: string | Date | number): string {
  if (!dateInput) {
    return 'N/A';
  }
  const date =
    typeof dateInput === 'string' || typeof dateInput === 'number'
      ? new Date(dateInput)
      : dateInput;
  if (isNaN(date.getTime())) {
    return 'Invalid Date';
  }

  const now = new Date();
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);

  if (seconds < 5) {
    return 'just now';
  }
  if (seconds < 60) {
    return `${seconds} sec ago`;
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  if (hours < 24) {
    return `${hours} hr ago`;
  }
  if (days === 1) {
    return `1 day ago`;
  }
  return `${days} days ago`;
}

/**
 * Formats client information into an HTML string for display in a job item.
 * This function generates HTML directly, intended for use with element.innerHTML.
 * @param {object} client The client object from a job.
 * @returns {string} The formatted HTML string for client info.
 */
function formatClientInfo(client: Job['client'] | undefined): DocumentFragment {
  const frag = document.createDocumentFragment();
  const label = document.createTextNode(`Client: ${client?.country ?? 'N/A'}`);
  frag.appendChild(label);

  if (client?.rating !== null && client?.rating !== undefined) {
    const separator = document.createTextNode(' | ');
    const span = document.createElement('span');
    const rating = client.rating;
    span.className = `job-item__client-rating${rating >= 4.9 ? ' job-item__client-rating--positive' : ''}`;
    span.title = 'Client Rating';
    span.textContent = `Rating: ${rating.toFixed(2)}`;
    frag.append(separator, span);
  }

  if (client?.totalSpent && Number(client.totalSpent) > 0) {
    const separator = document.createTextNode(' | ');
    const span = document.createElement('span');
    const spentAmount = Number(client.totalSpent);
    span.className = `job-item__client-spent${spentAmount > 10000 ? ' job-item__client-spent--positive' : ''}`;
    span.title = 'Client Spend';
    span.textContent = `Spent: $${spentAmount.toFixed(0)}`;
    frag.append(separator, span);
  }

  if (client?.paymentVerificationStatus !== 'VERIFIED') {
    const separator = document.createTextNode(' ');
    const span = document.createElement('span');
    span.className = 'job-item__unverified-icon';
    span.title = 'Client payment not verified';
    span.textContent = '⚠️';
    frag.append(separator, span);
  }

  return frag;
}

/**
 * Formats a list of skills into a display string.
 * @param {Array<object>} skills An array of skill objects, each with a 'name' property.
 * @returns {string} The formatted skills string (e.g., "Skills: Skill1, Skill2, Skill3...").
 */
function formatSkills(skills: { name: string }[]): string {
  if (!skills || skills.length === 0) {
    return '';
  }
  const skillNames = skills.map((s) => s.name);
  if (skillNames.length > 3) {
    return `Skills: ${skillNames.slice(0, 3).join(', ')}...`;
  }
  return `Skills: ${skillNames.join(', ')}`;
}

// Export functions if this file is used as a module, otherwise they are global in the browser context.
// For this project's MV2 setup, they are global.
// If this were an ES module, you'd have:
// export { constructUpworkSearchURL, timeAgo, formatBudget, formatClientInfo, formatSkills };

/**
 * Formats a job budget object into a display string.
 * @param {object} budget The budget object from a job.
 * @param {string} [budget.type] The type of job (e.g., 'HOURLY').
 * @param {number|string} [budget.minAmount] The minimum budget amount.
 * @param {number|string} [budget.maxAmount] The maximum budget amount.
 * @returns {string} The formatted budget string (e.g., "$20 - $40/hr", "$500").
 */
function formatBudget(budget: { type?: string; minAmount?: number | string; maxAmount?: number | string }): string {
  if (!budget) {
    return 'N/A';
  }

  const { type, minAmount, maxAmount } = budget;
  // Helper for thousand separators
  const formatNumber = (num: number | string | undefined) => {
    if (num === undefined) { return null; }
    const n = typeof num === 'string' ? parseFloat(num) : num;
    return isNaN(n) ? null : n.toLocaleString();
  };

  if (type?.toLowerCase().includes('hourly')) {
    // Always both min and max present for hourly jobs, but check for missing/invalid
    const min = formatNumber(minAmount);
    const max = formatNumber(maxAmount);
    if (min && max) {
      return `$${min} - $${max}/hr`;
    } else if (min) {
      return `$${min}/hr`;
    } else if (max) {
      return `$${max}/hr`;
    } else {
      return 'N/A';
    }
  } else {
    // Fixed price: show range if min and max differ, else just min
    const min = formatNumber(minAmount);
    const max = formatNumber(maxAmount);
    if (min && max && min !== max) {
      return `$${min} - $${max}`;
    } else if (min) {
      return `$${min}`;
    } else {
      return 'N/A';
    }
  }
}

/**
 * Initializes scroll hint shadows for a scrollable list within a container.
 * A top shadow appears when scrolled down, and a bottom shadow disappears when scrolled to the end.
 * @param {HTMLElement} containerEl The container element that will have the pseudo-elements for shadows.
 * @param {HTMLElement} listEl The scrollable list element inside the container.
 */
function initializeScrollHints(containerEl: HTMLElement, listEl: HTMLElement) {
  if (!containerEl || !listEl) {
    console.warn('Scroll hints not initialized: container or list element not found.');
    return;
  }

  const updateHints = () => {
    // Top shadow: visible only if scrolled down from the top
    const isScrolledFromTop = listEl.scrollTop > 10;
    containerEl.classList.toggle('job-list-container--scrolled', isScrolledFromTop);

    // Bottom shadow: hidden if scrolled to the very end (or if not scrollable)
    const isScrolledToEnd = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 1;
    containerEl.classList.toggle('job-list-container--scrolled-to-end', isScrolledToEnd);
  };

  listEl.addEventListener('scroll', updateHints);
  updateHints(); // Initial check
}

export { constructUpworkSearchURL, timeAgo, formatClientInfo, formatSkills, formatBudget, initializeScrollHints };

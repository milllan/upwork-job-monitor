/* exported constructUpworkSearchURL, timeAgo, formatClientInfo, formatSkills, formatBudget, initializeScrollHints */
// utils.ts
import { Job } from './types.js';

/**
 * Selects and returns the first element matching the given CSS selector within the specified scope.
 *
 * Throws an error if no matching element is found.
 *
 * @param selector - The CSS selector to search for
 * @param scope - The element or document to search within (defaults to the global document)
 * @returns The first matching element of type T
 */
export function $<T extends HTMLElement>(selector: string, scope: Document | HTMLElement = document): T {
  const element = scope.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Element with selector "${selector}" not found.`);
  }
  return element;
}

type Tier = 'EntryLevel' | 'IntermediateLevel' | 'ExpertLevel';

/**
 * Builds an Upwork job search URL with the specified query, contractor tiers, and sort order.
 *
 * @param userQuery - The search query to include in the URL
 * @param contractorTiersGraphQL - Array of contractor tier names to filter results (e.g., "EntryLevel", "IntermediateLevel", "ExpertLevel")
 * @param sortBy - Sort order for the search results (e.g., "recency", "relevance")
 * @returns The complete Upwork job search URL with applied filters
 */
function constructUpworkSearchURL(userQuery: string, contractorTiersGraphQL: Tier[], sortBy: string): string {
  const baseURL = 'https://www.upwork.com/nx/search/jobs/';
  const encodedQuery = encodeURIComponent(userQuery);

  const tierMap: { [key in Tier]: string } = {
    EntryLevel: '1',
    IntermediateLevel: '2',
    ExpertLevel: '3',
  };

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
 * Returns a human-readable string representing how much time has passed since the given date.
 *
 * Converts a date input into a relative time string such as "just now", "x sec ago", "x min ago", "x hr ago", "1 day ago", or "x days ago". Returns "N/A" if the input is missing, or "Invalid Date" if the date cannot be parsed.
 *
 * @param dateInput - The date or timestamp to convert
 * @returns A string describing the elapsed time since `dateInput`
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
 * Generates an HTML string summarizing client information for a job listing.
 *
 * Displays the client's country, rating (with styling for high ratings), total spent (with styling for high spenders), and a warning icon if payment is not verified. Returns "Client info N/A" if no client data is provided.
 *
 * @returns An HTML string representing the client's information for display.
 */
function formatClientInfo(client: Job['client'] | undefined): string {
  let clientInfo = 'Client info N/A';
  if (client) {
    clientInfo = `Client: ${client.country || 'N/A'}`;

    // Client Rating
    if (client.rating !== null && client.rating !== undefined) {
      const rating = client.rating;
      const ratingClass = rating >= 4.9 ? ' job-item__client-rating--positive' : '';
      clientInfo += ` | <span class="job-item__client-rating${ratingClass}" title="Client Rating">Rating: ${rating.toFixed(2)}</span>`;
    }

    // Client Total Spent
    if (client.totalSpent && Number(client.totalSpent) > 0) {
      const spentAmount = Number(client.totalSpent);
      const spentClass = spentAmount > 10000 ? ' job-item__client-spent--positive' : ''; // Threshold for high spender
      clientInfo += ` | <span class="job-item__client-spent${spentClass}" title="Client Spend">Spent: ${spentAmount.toFixed(0)}</span>`;
    }

    // Payment Verification Status
    if (client.paymentVerificationStatus !== 'VERIFIED') {
      clientInfo += ` <span class="job-item__unverified-icon" title="Client payment not verified">⚠️</span>`;
    }
  }
  return clientInfo;
}

/**
 * Formats up to three skill names from a list into a display string, appending an ellipsis if more skills exist.
 *
 * @param skills - An array of skill objects with a `name` property
 * @returns A string in the format "Skills: Skill1, Skill2, Skill3..." or an empty string if no skills are provided
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
 * Formats a job budget object into a human-readable string for display.
 *
 * For hourly jobs, returns a string like "20 - 40/hr" or "20/hr". For fixed price jobs, returns a range if min and max differ, or a single value. Uses thousand separators for numbers. Returns "N/A" if budget data is missing or invalid.
 *
 * @param budget - The job budget object with optional type, minAmount, and maxAmount fields
 * @returns The formatted budget string, or "N/A" if unavailable
 */
function formatBudget(budget: { type?: string; minAmount?: number | string; maxAmount?: number | string }): string {
  if (!budget) {
    return 'N/A';
  }

  const { type, minAmount, maxAmount } = budget;
  // Helper for thousand separators
  const formatNumber = (num: number | string) => {
    const n = parseFloat(num as string);
    return isNaN(n) ? null : n.toLocaleString();
  };

  if (type?.toLowerCase().includes('hourly')) {
    // Always both min and max present for hourly jobs, but check for missing/invalid
    const min = formatNumber(minAmount as string);
    const max = formatNumber(maxAmount as string);
    if (min && max) {
      return `${min} - ${max}/hr`;
    } else if (min) {
      return `${min}/hr`;
    } else if (max) {
      return `${max}/hr`;
    } else {
      return 'N/A';
    }
  } else {
    // Fixed price: show range if min and max differ, else just min
    const min = formatNumber(minAmount as string);
    const max = formatNumber(maxAmount as string);
    if (min && max && min !== max) {
      return `${min} - ${max}`;
    } else if (min) {
      return `${min}`;
    } else {
      return 'N/A';
    }
  }
}

/**
 * Adds dynamic shadow classes to a container element based on the scroll position of a nested list, providing visual scroll hints at the top and bottom.
 *
 * The container receives a class when the list is scrolled down from the top, and another class when scrolled to the end. If either element is missing, the function logs a warning and does nothing.
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

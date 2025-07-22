import { Job } from '../../types.js';
import { formatBudget, formatClientInfo, formatSkills, timeAgo } from '../../utils/utils.js';

interface JobItemOptions {
  isCollapsed: boolean;
  onToggle: (jobId: string, isCollapsed: boolean) => void;
  onDelete: (jobId: string) => void;
  onSelect: (ciphertext: string) => void;
}

interface JobItemViewModel {
  id: string;
  ciphertext: string;
  budget: string;
  clientInfo: string;
  skills: string;
  title: string;
  jobUrl: string;
  postedOn: string;
  timeAgo: string;
  hasSkills: boolean;
  priorityTagText: string;
  hasPriorityTag: boolean;
  isLowPriority: boolean;
  isExcludedByTitleFilter: boolean;
  isApplied: boolean;
  isHighRating: boolean;
  isHighSpent: boolean;
}

export class JobItem {
  private jobData: Job;
  private options: JobItemOptions;
  private _element: HTMLElement | null = null;
  private viewModel: JobItemViewModel | null = null;

  get element(): HTMLElement | null {
    return this._element;
  }

  constructor(jobData: Job, options: Partial<JobItemOptions> = {}) {
    this.jobData = jobData;
    this.options = {
      isCollapsed: false,
      onToggle: () => {},
      onDelete: () => {},
      onSelect: () => {},
      ...options,
    };
  }

  render(): HTMLElement {
    try {
      if (!this._element) {
        this._element = this._createElement();
        this._attachEventListeners();
      }
      this._updateElement();
    } catch (error) {
      console.error('JobItem render error:', error);
      if (!this._element) {
        this._element = this._createElement(); // Attempt to create a basic element for error display
      }
      this._element.innerHTML = '<div class="job-item__error">Error displaying job</div>';
    }
    return this._element as HTMLElement;
  }

  update(newJobData: Job, newOptions: Partial<JobItemOptions> = {}): void {
    this.jobData = newJobData;
    this.options = { ...this.options, ...newOptions };
    if (this._element) {
      this._updateElement();
    }
  }

  getId(): string {
    return this.jobData.id;
  }

  getCiphertext(): string {
    return this.jobData.ciphertext || this.jobData.id;
  }

  destroy(): void {
    this._element?.remove();
    this._element = null;
    this.viewModel = null;
  }

  private _createElement(): HTMLElement {
    const template = document.getElementById('job-item-template') as HTMLTemplateElement;
    // This check is good practice but might be flagged as unnecessary if template is always present.
    // We can leave it for robustness. Linter may have another target.
    const clone = template.content.cloneNode(true) as DocumentFragment;
    
    const element = clone.querySelector('.job-item') as HTMLElement;
    if (!element) {
      throw new Error('JobItem: .job-item not found in template');
    }
    return element;
  }

  private _attachEventListeners(): void {
    if (!this._element) {
      return;
    }

    const toggleButton = this._element.querySelector('.job-item__toggle');
    if (toggleButton) {
      toggleButton.addEventListener('click', (e) => {
        e.stopPropagation();
        const newCollapsedState = !this.options.isCollapsed;
        this.options.onToggle(this.getId(), newCollapsedState);
      });
    }

    const deleteButton = this._element.querySelector('.job-item__delete-btn');
    if (deleteButton) {
      deleteButton.addEventListener('click', (e) => {
        e.stopPropagation();
        this.options.onDelete(this.getId());
      });
    }

    this._element.addEventListener('mouseenter', () => {
      this.options.onSelect(this.getCiphertext());
    });
  }

  private _updateElement(): void {
    if (!this._element) {
      return;
    }

    this.viewModel = this._prepareViewModel();
    this._populateFromViewModel();
    this._updateClasses();
  }

  /**
   * Determines the text for the priority tag based on job properties.
   * @param job The job data object.
   * @returns The string to display in the tag, or an empty string if no tag is needed.
   */
  private _getPriorityTagText(job: Job): string {
    if (job.isExcludedByTitleFilter) {
      return 'Filtered';
    }
    if (job.isLowPriorityByClientCountry && job.client.country) {
      // Capitalize the country name for display
      return job.client.country.charAt(0).toUpperCase() + job.client.country.slice(1).toLowerCase();
    }
    if (job.isLowPriorityBySkill) {
      return 'Skill';
    }
    return '';
  }

  private _prepareViewModel(): JobItemViewModel {
    const job = this.jobData;
    const isLowPriority = job.isLowPriorityBySkill || job.isLowPriorityByClientCountry;
    const priorityTagText = this._getPriorityTagText(job);

    const postedOnDate = job.postedOn ? new Date(job.postedOn) : null;
    const hasSkills = job.skills && job.skills.length > 0;

    return {
      id: job.id,
      ciphertext: job.ciphertext || job.id,
      budget: formatBudget(job.budget),
      clientInfo: '', // This will be handled by the DOM fragment
      skills: formatSkills(job.skills),
      title: job.title || 'No Title',
      jobUrl: `https://www.upwork.com/jobs/${job.ciphertext || job.id}`,
      postedOn: postedOnDate
        ? `${postedOnDate.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}, ${postedOnDate.toLocaleDateString()}`
        : 'N/A',
      timeAgo: postedOnDate ? timeAgo(postedOnDate) : 'N/A',
      hasSkills: hasSkills,
      priorityTagText: priorityTagText,
      hasPriorityTag: !!priorityTagText,
      isLowPriority: !!isLowPriority,
      isExcludedByTitleFilter: !!job.isExcludedByTitleFilter,
      isApplied: !!job.applied,
      isHighRating: !!(job.client.rating && job.client.rating >= 4.9),
      isHighSpent: !!(job.client.totalSpent && job.client.totalSpent > 10000),
    };
  }

  private _populateFromViewModel(): void {
    if (!this._element || !this.viewModel) {
      return;
    }

    const vm = this.viewModel;

    const budgetField = this._element.querySelector('[data-field="budget"]');
    if (budgetField) {
      const budgetMeta = budgetField.closest('.job-item__meta'); // This can return null, so optional chaining is appropriate.
      if (vm.budget && vm.budget !== 'N/A') {
        budgetField.textContent = vm.budget;
        if (budgetMeta) {
          budgetMeta.classList.remove('hidden');
        }
      } else {
        budgetField.textContent = '';
        if (budgetMeta) {
          budgetMeta.classList.add('hidden');
        }
      }
    }

    const clientInfoEl = this._element.querySelector('[data-field="client-info"]');
    if (clientInfoEl) {
      clientInfoEl.textContent = ''; // Clear existing content
      clientInfoEl.appendChild(formatClientInfo(this.jobData.client));
    }

    const skillsEl = this._element.querySelector('[data-field="skills"]');
    if (skillsEl) {
      skillsEl.textContent = vm.skills;
    }

    const priorityTagEl = this._element.querySelector('[data-field="priority-tag-text"]');
    if (priorityTagEl) {
      priorityTagEl.textContent = vm.priorityTagText;
    }

    const postedOnEl = this._element.querySelector('[data-field="posted-on"]');
    if (postedOnEl) {
      postedOnEl.textContent = vm.postedOn;
    }

    const timeAgoEl = this._element.querySelector('[data-field="time-ago"]');
    if (timeAgoEl) {
      timeAgoEl.textContent = vm.timeAgo;
    }

    const titleLink = this._element.querySelector('.job-item__title') as HTMLAnchorElement;
    if (titleLink) {
      titleLink.href = vm.jobUrl;
      this._element.dataset.ciphertextForTooltip = vm.ciphertext;
      titleLink.textContent = vm.title;
    }
  }

  private _updateClasses(): void {
    if (!this._element || !this.viewModel) {
      return;
    }

    const vm = this.viewModel;

    this._element.classList.toggle('job-item--collapsed', this.options.isCollapsed);
    this._element.classList.toggle('job-item--low-priority', vm.isLowPriority);
    this._element.classList.toggle('job-item--excluded', vm.isExcludedByTitleFilter);
    this._element.classList.toggle('job-item--applied', vm.isApplied);
    this._element.classList.toggle('job-item--has-skills', vm.hasSkills);
    this._element.classList.toggle('job-item--has-priority-tag', vm.hasPriorityTag);
    this._element.classList.toggle('job-item--high-rating', vm.isHighRating);
    this._element.classList.toggle('job-item--high-spent', vm.isHighSpent);
  }
}

/**
 * JobItem Component
 * Handles the rendering and behavior of individual job items in the job list.
 * This replaces the _populateJobItemElement function with a more organized component approach.
 */

class JobItem {
  constructor(jobData, options = {}) {
    this.jobData = jobData;
    this.options = {
      isCollapsed: false,
      onToggle: null,
      onDelete: null,
      onSelect: null,
      ...options
    };
    this.element = null;
    this.viewModel = null;
  }

  /**
   * Creates the DOM element for this job item
   * @returns {HTMLElement} The job item element
   */
  render() {
    if (!this.element) {
      this.element = this._createElement();
      this._attachEventListeners();
    }
    this._updateElement();
    return this.element;
  }

  /**
   * Updates the job data and re-renders if necessary
   * @param {Object} newJobData - Updated job data
   * @param {Object} newOptions - Updated options
   */
  update(newJobData, newOptions = {}) {
    this.jobData = newJobData;
    this.options = { ...this.options, ...newOptions };
    if (this.element) {
      this._updateElement();
    }
  }

  /**
   * Gets the job ID
   * @returns {string} The job ID
   */
  getId() {
    return this.jobData.id;
  }

  /**
   * Gets the job ciphertext
   * @returns {string} The job ciphertext
   */
  getCiphertext() {
    return this.jobData.ciphertext || this.jobData.id;
  }

  /**
   * Destroys the component and cleans up event listeners
   */
  destroy() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;
    this.viewModel = null;
  }

  // Private methods

  /**
   * Creates the initial DOM element from template
   * @private
   */
  _createElement() {
    const template = document.getElementById('job-item-template');
    if (!template) {
      throw new Error('JobItem: job-item-template not found');
    }
    const clone = template.content.cloneNode(true);
    return clone.querySelector('.job-item');
  }

  /**
   * Attaches event listeners to the element
   * @private
   */
  _attachEventListeners() {
    if (!this.element) {return;}

    // Toggle button
    const toggleButton = this.element.querySelector('.job-item__toggle');
    if (toggleButton) {
      toggleButton.addEventListener('click', (e) => {
        e.stopPropagation();
        const newCollapsedState = !this.options.isCollapsed;
        if (this.options.onToggle) {
          this.options.onToggle(this.getId(), newCollapsedState);
        }
      });
    }

    // Delete button
    const deleteButton = this.element.querySelector('.job-item__delete-btn');
    if (deleteButton) {
      deleteButton.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.options.onDelete) {
          this.options.onDelete(this.getId());
        }
      });
    }

    // Mouse enter for details preview
    this.element.addEventListener('mouseenter', () => {
      if (this.options.onSelect) {
        this.options.onSelect(this.getCiphertext());
      }
    });
  }

  /**
   * Updates the element content with current data
   * @private
   */
  _updateElement() { // This method is called by render() and update()
    if (!this.element) {return;}

    // Prepare the ViewModel
    this.viewModel = this._prepareViewModel();
    this._populateFromViewModel();
    this._updateClasses();
    //this._updateDataAttributes();
  }

  /**
   * Creates a view model from the job data
   * @private
   */
  _prepareViewModel() { // Renamed from _createViewModel for consistency
    const job = this.jobData;
    const isLowPriority = job.isLowPriorityBySkill || job.isLowPriorityByClientCountry;
    
    let priorityTagText = '';
    if (job.isExcludedByTitleFilter) {
      priorityTagText = 'Filtered';
    } else if (job.isLowPriorityByClientCountry && job.client && job.client.country) {
      const countryName = job.client.country.charAt(0).toUpperCase() + job.client.country.slice(1).toLowerCase();
      priorityTagText = countryName;
    } else if (job.isLowPriorityBySkill) {
      priorityTagText = 'Skill';
    }

    const postedOnDate = job.postedOn ? new Date(job.postedOn) : null;
    const hasSkills = job.skills && job.skills.length > 0;

    return {
      // Raw data
      id: job.id,
      ciphertext: job.ciphertext || job.id,
      
      // Formatted display strings
      budget: formatBudget(job.budget),
      clientInfo: formatClientInfo(job.client),
      skills: formatSkills(job.skills),
      title: job.title || 'No Title',
      jobUrl: `https://www.upwork.com/jobs/${job.ciphertext || job.id}`,
      postedOn: postedOnDate ? `${postedOnDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}, ${postedOnDate.toLocaleDateString()}` : 'N/A',
      timeAgo: postedOnDate ? timeAgo(postedOnDate) : 'N/A',

      // HTML snippets
      hasSkills: hasSkills,
      priorityTagText: priorityTagText, // Just the text, not HTML
      hasPriorityTag: !!priorityTagText, // Boolean flag for priority tag visibility

      // Boolean flags for classes
      isLowPriority: isLowPriority,
      isExcludedByTitleFilter: job.isExcludedByTitleFilter,
      isApplied: !!job.applied,
      isHighRating: job.client && parseFloat(job.client.rating) >= 4.9,
      isHighSpent: job.client && job.client.totalSpent != null && Number(job.client.totalSpent) > 10000,
    };
  }

  /**
   * Populates the element from the view model
   * @private
   */
  _populateFromViewModel() {
    const vm = this.viewModel;
    
    // Populate text content
    this.element.querySelector('[data-field="budget"]').textContent = vm.budget;
    this.element.querySelector('[data-field="client-info"]').innerHTML = vm.clientInfo;

    const skillsElement = this.element.querySelector('[data-field="skills"]');
    skillsElement.textContent = vm.skills; // Set text content regardless of whether there are skills
    
    this.element.querySelector('[data-field="priority-tag-text"]').textContent = vm.priorityTagText;

    this.element.querySelector('[data-field="posted-on"]').textContent = vm.postedOn;
    this.element.querySelector('[data-field="time-ago"]').textContent = vm.timeAgo;
    
    // Update title link
    const titleLink = this.element.querySelector('.job-item__title');
    titleLink.href = vm.jobUrl;
    this.element.dataset.ciphertextForTooltip = vm.ciphertext; // Moved from _updateDataAttributes for consistency
    titleLink.textContent = vm.title;
  }

  /**
   * Updates CSS classes based on view model
   * @private
   */
  _updateClasses() {
    const vm = this.viewModel;
    
    this.element.classList.toggle('job-item--collapsed', this.options.isCollapsed);
    this.element.classList.toggle('job-item--low-priority', vm.isLowPriority);
    this.element.classList.toggle('job-item--excluded', vm.isExcludedByTitleFilter);
    this.element.classList.toggle('job-item--applied', vm.isApplied); // Controls applied icon visibility via CSS
    this.element.classList.toggle('job-item--has-skills', vm.hasSkills);
    this.element.classList.toggle('job-item--has-priority-tag', vm.hasPriorityTag); // Controls priority tag visibility via CSS
    this.element.classList.toggle('job-item--high-rating', vm.isHighRating);
    this.element.classList.toggle('job-item--high-spent', vm.isHighSpent);
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = JobItem;
} else {
  window.JobItem = JobItem;
}

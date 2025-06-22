/**
 * JobDetails Component
 * Handles the rendering and state of the job details panel.
 * This replaces the updateDetailsPanel and _prepareJobDetailsViewModel functions
 * with a more organized component approach.
 */
class JobDetails {
  constructor(containerElement) {
    this.container = containerElement;
    this.template = document.getElementById('job-details-template');

    if (!this.container || !this.template) {
      throw new Error('JobDetails component requires a container and a template element.');
    }
    this.showInitialMessage();
  }

  showLoading() {
    this.container.innerHTML = '<div class="details-panel__loading">Loading details...</div>';
  }

  showError(error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.container.innerHTML = `<p class="details-panel__error">Failed to load job details: ${errorMessage}. Please try again later.</p>`;
  }

  showInitialMessage(message = 'Select a job to see details.') {
    this.container.innerHTML = `<p class="details-panel__no-jobs">${message}</p>`;
  }

  render(details) {
    if (!details) {
      this.showInitialMessage('No details available for this job.');
      return;
    }

    const vm = this._prepareViewModel(details);
    const clone = this.template.content.cloneNode(true);

    // --- Helper to populate a field ---
    const populateField = (fieldName, content, isHtml = false) => {
      const field = clone.querySelector(`[data-field="${fieldName}"]`);
      if (field && content) {
        if (isHtml) field.innerHTML = content; else field.textContent = content;
      }
    };

    // --- Helper to set section visibility ---
    const setSectionVisibility = (sectionName, isVisible) => {
      const section = clone.querySelector(`[data-section="${sectionName}"]`);
      if (section) section.style.display = isVisible ? '' : 'none';
    };

    // --- Populate from ViewModel ---
    setSectionVisibility('client-info', vm.showClientInfo);
    if (vm.showClientInfo) {
      populateField('client-jobs-posted', vm.clientJobsPosted);
      populateField('client-hours', vm.clientHours);
      populateField('client-feedback-count', vm.clientFeedbackCount);
    }

    setSectionVisibility('job-activity', vm.showJobActivity);
    if (vm.showJobActivity) {
      populateField('activity-applicants', vm.activityApplicants);
      populateField('activity-interviews', vm.activityInterviews);
      populateField('activity-hired', vm.activityHired);
      populateField('activity-last-active', vm.activityLastActiveHTML, true);
    }

    setSectionVisibility('bid-stats', vm.showBidStats);
    if (vm.showBidStats) {
      populateField('bid-avg', vm.bidAvg);
      populateField('bid-range', vm.bidRange);
    }

    setSectionVisibility('questions', vm.showQuestions);
    if (vm.showQuestions) {
      const list = clone.querySelector('[data-field="questions-list"]');
      vm.questions.forEach(qText => {
        const li = document.createElement('li');
        li.textContent = qText;
        list.appendChild(li);
      });
    }

    setSectionVisibility('contractor-history', vm.showContractorHistory);
    if (vm.showContractorHistory) {
      const list = clone.querySelector('[data-field="contractor-history-list"]');
      if (list) {
        vm.contractorHistory.forEach(contractor => {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = `https://www.upwork.com/freelancers/${contractor.ciphertext}`;
          a.textContent = contractor.name;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          li.appendChild(a);
          list.appendChild(li);
        });
      }
    }

    setSectionVisibility('description', vm.showDescription);
    if (vm.showDescription) {
      populateField('description-content', vm.descriptionHTML, true);
    }

    this.container.innerHTML = '';
    this.container.appendChild(clone);
  }

  _prepareViewModel(details) {
    const vm = {
      clientJobsPosted: null, clientHours: null, clientFeedbackCount: null, showClientInfo: false,
      activityApplicants: null, activityInterviews: null, activityHired: null, activityLastActiveHTML: null, showJobActivity: false,
      bidAvg: null, bidRange: null, showBidStats: false,
      contractorHistory: [], showContractorHistory: false,
      questions: [], showQuestions: false,
      descriptionHTML: null, showDescription: false,
    };

    const clientStats = details?.buyer?.info?.stats || {};
    if (Object.keys(clientStats).length > 0) {
      vm.clientJobsPosted = `Jobs: ${clientStats.totalAssignments || 0}`;
      if (clientStats.hoursCount > 0) vm.clientHours = `${Math.round(clientStats.hoursCount).toLocaleString()} h total`;
      if (clientStats.feedbackCount > 0) vm.clientFeedbackCount = `Feedback: ${clientStats.feedbackCount}`;
      vm.showClientInfo = true;
    }

    const clientActivity = details?.opening?.job?.clientActivity || {};
    if (Object.keys(clientActivity).length > 0) {
      if (clientActivity.lastBuyerActivity) {
        const lastActivityDate = new Date(clientActivity.lastBuyerActivity);
        const fullTimestamp = `${lastActivityDate.toLocaleDateString()} ${lastActivityDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
        vm.activityLastActiveHTML = `<span title="${fullTimestamp}">${timeAgo(lastActivityDate)}</span>`;
      }
      vm.activityApplicants = `Applicants: ${clientActivity.totalApplicants || 0}`;
      vm.activityInterviews = `Interviews: ${clientActivity.totalInvitedToInterview || 0}`;
      vm.activityHired = `Hired: ${clientActivity.totalHired || 0}/${clientActivity.numberOfPositionsToHire || 1}`;
      vm.showJobActivity = true;
    }

    const bidStats = details?.applicantsBidsStats || {};
    const avgBid = bidStats.avgRateBid?.amount;
    const minBid = bidStats.minRateBid?.amount;
    const maxBid = bidStats.maxRateBid?.amount;
    if (avgBid || minBid || maxBid) {
      vm.bidAvg = `Avg: $${(avgBid || 0).toFixed(1)}`;
      vm.bidRange = `Range: $${minBid || 0} - $${maxBid || 0}`;
      vm.showBidStats = true;
    }

    const workHistory = details?.buyer?.workHistory || [];
    if (workHistory.length > 0) {
      // Use a Map to get unique contractors by their ciphertext, ensuring no duplicates.
      const contractors = new Map();
      workHistory.forEach(h => {
        const info = h.contractorInfo;
        // Ensure we have a name and a ciphertext to build the link, and that the contractor is not already in our list.
        if (info && info.contractorName && info.ciphertext && !contractors.has(info.ciphertext)) {
          contractors.set(info.ciphertext, info.contractorName);
        }
      });
      if (contractors.size > 0) {
        vm.contractorHistory = Array.from(contractors, ([ciphertext, name]) => ({ name, ciphertext }));
        vm.showContractorHistory = true;
      }
    }

    const questions = details?.opening?.questions || [];
    if (questions.length > 0) {
      vm.questions = questions.map(q => q.question);
      vm.showQuestions = true;
    }

    const jobDescription = details?.opening?.job?.description;
    if (jobDescription && jobDescription.trim().length > 0) {
      vm.descriptionHTML = jobDescription.replace(/<\/?[^>]+(>|$)/g, "").trim().replace(/\n/g, '<br>');
      vm.showDescription = true;
    }

    return vm;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = JobDetails;
} else {
  window.JobDetails = JobDetails;
}
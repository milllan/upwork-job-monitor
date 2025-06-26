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

    // --- Helper to populate a field, now also handles hiding the parent section ---
    const populateField = (fieldName, content, isHtml = false, sectionName = null) => {
      const field = clone.querySelector(`[data-field="${fieldName}"]`);
      const section = sectionName
        ? clone.querySelector(`[data-section="${sectionName}"]`)
        : field?.closest('[data-section]');

      if (field && content) {
        if (isHtml) {
          field.innerHTML = content;
        } else {
          field.textContent = content;
        }
        if (section) {
          section.classList.remove('hidden');
        }
      } else if (section) {
        section.classList.add('hidden');
      }
    };

    // --- Helper to set visibility of a section based on a boolean ---
    const setSectionVisibility = (sectionName, isVisible) => {
      const section = clone.querySelector(`[data-section="${sectionName}"]`);
      if (section) {
        section.classList.toggle('hidden', !isVisible);
      }
    };

    // --- Populate from ViewModel ---
    populateField('client-jobs-posted', vm.clientJobsPosted, false, 'client-info');
    populateField('client-hours', vm.clientHours, false, 'client-info');
    populateField('client-feedback-count', vm.clientFeedbackCount, false, 'client-info');

    setSectionVisibility('job-activity', vm.showJobActivity);
    if (vm.showJobActivity) {
      populateField('activity-applicants', vm.activityApplicants);
      populateField('activity-interviews', vm.activityInterviews);
      populateField('activity-hired', vm.activityHired);
      populateField('activity-last-active', vm.activityLastActiveHTML, true);
    }

    populateField('bid-avg', vm.bidAvg, false, 'bid-stats');
    populateField('bid-range', vm.bidRange, false, 'bid-stats');

    const questionsList = clone.querySelector('[data-field="questions-list"]');
    const questionsSection = clone.querySelector('[data-section="questions"]');
    if (vm.questions.length > 0) {
      vm.questions.forEach((qText) => {
        const li = document.createElement('li');
        li.textContent = qText;
        questionsList.appendChild(li);
      });
      questionsSection.classList.remove('hidden');
    } else {
      questionsSection.classList.add('hidden');
    }

    const contractorList = clone.querySelector('[data-field="contractor-history-list"]');
    const contractorSection = clone.querySelector('[data-section="contractor-history"]');
    if (vm.contractorHistory.length > 0) {
      vm.contractorHistory.forEach((contractor) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = `https://www.upwork.com/freelancers/${contractor.ciphertext}`;
        a.textContent = contractor.name.split(' ')[0]; // Only first name
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        li.appendChild(a);
        contractorList.appendChild(li);
      });
      contractorSection.classList.remove('hidden');
    } else {
      contractorSection.classList.add('hidden');
    }

    populateField('description-content', vm.descriptionHTML, true, 'description');

    this.container.innerHTML = '';
    this.container.appendChild(clone);
  }

  _prepareViewModel(details) {
    const vm = {
      clientJobsPosted: null,
      clientHours: null,
      clientFeedbackCount: null,
      activityApplicants: null,
      activityInterviews: null,
      activityHired: null,
      activityLastActiveHTML: null,
      bidAvg: null,
      bidRange: null,
      contractorHistory: [],
      questions: [],
      descriptionHTML: null,
      showJobActivity: false,
    };

    const clientStats = details?.buyer?.info?.stats || {};
    vm.clientJobsPosted = clientStats.totalAssignments
      ? `Jobs: ${clientStats.totalAssignments}`
      : null;
    vm.clientHours =
      clientStats.hoursCount > 0
        ? `${Math.round(clientStats.hoursCount).toLocaleString()} h total`
        : null;
    vm.clientFeedbackCount =
      clientStats.feedbackCount > 0 ? `Feedback: ${clientStats.feedbackCount}` : null;

    const clientActivity = details?.opening?.job?.clientActivity || {};
    if (clientActivity.lastBuyerActivity) {
      const lastActivityDate = new Date(clientActivity.lastBuyerActivity);
      const fullTimestamp = `${lastActivityDate.toLocaleDateString()} ${lastActivityDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      vm.activityLastActiveHTML = `<span title="${fullTimestamp}">${timeAgo(lastActivityDate)}</span>`;
    }
    vm.activityApplicants = clientActivity.totalApplicants
      ? `Applicants: ${clientActivity.totalApplicants}`
      : null;
    vm.activityInterviews = clientActivity.totalInvitedToInterview
      ? `Interviews: ${clientActivity.totalInvitedToInterview}`
      : null;
    vm.activityHired = `Hired: ${clientActivity.totalHired || 0}/${clientActivity.numberOfPositionsToHire || 1}`;

    // Determine if the job activity section should be shown
    vm.showJobActivity = !!(
      vm.activityApplicants ||
      vm.activityInterviews ||
      vm.activityHired ||
      vm.activityLastActiveHTML
    );

    const bidStats = details?.applicantsBidsStats || {};
    const avgBid = bidStats.avgRateBid?.amount;
    const minBid = bidStats.minRateBid?.amount;
    const maxBid = bidStats.maxRateBid?.amount;
    if (avgBid || minBid || maxBid) {
      vm.bidAvg = `Avg: $${(avgBid || 0).toFixed(1)}`;
      vm.bidRange = `Range: $${minBid || 0} - $${maxBid || 0}`;
    }

    const workHistory = details?.buyer?.workHistory || [];
    if (workHistory.length > 0) {
      const contractors = new Map();
      workHistory.forEach((h) => {
        const info = h.contractorInfo;
        if (info && info.contractorName && info.ciphertext && !contractors.has(info.ciphertext)) {
          contractors.set(info.ciphertext, info.contractorName);
        }
      });
      vm.contractorHistory = Array.from(contractors, ([ciphertext, name]) => ({
        name,
        ciphertext,
      }));
    }

    const questions = details?.opening?.questions || [];
    vm.questions = questions.map((q) => q.question);

    const jobDescription = details?.opening?.job?.description;
    if (jobDescription && jobDescription.trim().length > 0) {
      vm.descriptionHTML = jobDescription
        .replace(/<\/?[^>]+(>|$)/g, '')
        .trim()
        .replace(/\n/g, '<br>');
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

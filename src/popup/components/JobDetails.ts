import { JobDetails as JobDetailsType } from '../../types.js';
import { timeAgo } from '../../utils/utils.js';

interface JobDetailsViewModel {
  clientJobsPosted: string | null;
  clientHours: string | null;
  clientFeedbackCount: string | null;
  activityApplicants: string | null;
  activityInterviews: string | null;
  activityHired: string | null;
  activityLastActiveHTML: string | null;
  bidAvg: string | null;
  bidRange: string | null;
  contractorHistory: { name: string; ciphertext: string }[];
  questions: string[];
  descriptionHTML: string | null;
  showJobActivity: boolean;
}

export class JobDetails {
  private container: HTMLElement;
  private template: HTMLTemplateElement;

  constructor(containerElement: HTMLElement) {
    this.container = containerElement;
    const template = document.getElementById('job-details-template');
    if (!template || !(template instanceof HTMLTemplateElement)) {
      throw new Error('JobDetails component requires a template element with id "job-details-template".');
    }
    this.template = template;
    this.showInitialMessage();
  }

  showLoading(): void {
    this.container.innerHTML = '<div class="details-panel__loading">Loading details...</div>';
  }

  showError(error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.container.innerHTML = `<p class="details-panel__error">Failed to load job details: ${errorMessage}. Please try again later.</p>`;
  }

  showInitialMessage(message = 'Select a job to see details.'): void {
    this.container.innerHTML = `<p class="details-panel__no-jobs">${message}</p>`;
  }

  render(details: JobDetailsType | null): void {
    if (!details) {
      this.showInitialMessage('No details available for this job.');
      return;
    }

    const vm = this._prepareViewModel(details);
    const clone = this.template.content.cloneNode(true) as DocumentFragment;

    const populateField = (
      fieldName: string,
      content: string | null,
      isHtml = false,
      sectionName: string | null = null
    ) => {
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

    const setSectionVisibility = (sectionName: string, isVisible: boolean) => {
      const section = clone.querySelector(`[data-section="${sectionName}"]`);
      if (section) {
        section.classList.toggle('hidden', !isVisible);
      }
    };

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
    if (questionsList && questionsSection) {
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
    }

    const contractorList = clone.querySelector('[data-field="contractor-history-list"]');
    const contractorSection = clone.querySelector('[data-section="contractor-history"]');
    if (contractorList && contractorSection) {
      if (vm.contractorHistory.length > 0) {
        vm.contractorHistory.forEach((contractor) => {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = `https://www.upwork.com/freelancers/${contractor.ciphertext}`;
          a.textContent = contractor.name.split(' ')[0] || contractor.name || 'Unknown';
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          li.appendChild(a);
          contractorList.appendChild(li);
        });
        contractorSection.classList.remove('hidden');
      } else {
        contractorSection.classList.add('hidden');
      }
    }

    populateField('description-content', vm.descriptionHTML, true, 'description');

    this.container.innerHTML = '';
    this.container.appendChild(clone);
  }

  private _prepareViewModel(details: JobDetailsType): JobDetailsViewModel {
    const vm: JobDetailsViewModel = {
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
      const fullTimestamp = `${lastActivityDate.toLocaleDateString()} ${lastActivityDate.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })}`;
      vm.activityLastActiveHTML = `<span title="${fullTimestamp}">${timeAgo(
        lastActivityDate
      )}</span>`;
    }
    vm.activityApplicants = clientActivity.totalApplicants
      ? `Applicants: ${clientActivity.totalApplicants}`
      : null;
    vm.activityInterviews = clientActivity.totalInvitedToInterview
      ? `Interviews: ${clientActivity.totalInvitedToInterview}`
      : null;
    vm.activityHired = `Hired: ${clientActivity.totalHired || 0}/${clientActivity.numberOfPositionsToHire || 1}`;

    vm.showJobActivity = !!(
      vm.activityApplicants ||
      vm.activityInterviews ||
      vm.activityHired ||
      vm.activityLastActiveHTML
    );

    // Bid statistics are not always present, so we check for their existence.
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
      const contractors = new Map<string, string>();
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
      // Use DOMParser for robust and safe HTML stripping, then reformat for display.
      const parser = new DOMParser();
      const doc = parser.parseFromString(jobDescription, 'text/html');
      vm.descriptionHTML = doc.body.textContent?.trim().replace(/\n/g, '<br>') || null;
    }

    return vm;
  }
}

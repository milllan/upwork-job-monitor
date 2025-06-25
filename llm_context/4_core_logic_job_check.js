// --- Main Job Checking Logic (runJobCheck) --- from background/service-worker.js file
async function runJobCheck(triggeredByUserQuery) {
  console.log("MV2: Attempting runJobCheck (Direct Background with token loop)...");
  await StorageManager.setMonitorStatus("Checking...");
  
  // Use the passed query or get from storage
  const userQueryToUse = triggeredByUserQuery ||
    await StorageManager.getCurrentUserQuery() || // Use StorageManager
    config.DEFAULT_USER_QUERY; // Use config object
    
  console.log("MV2: Using query for check:", userQueryToUse);

  const apiResult = await UpworkAPI.fetchJobsWithTokenRotation(userQueryToUse);

  let fetchedJobs = null;
  let successfulToken = null;

  if (apiResult && !apiResult.error) {
    fetchedJobs = apiResult.jobs;
    successfulToken = apiResult.token;
  } else {
    console.error("MV2: Failed to fetch jobs after trying all tokens.", apiResult?.message);
    await StorageManager.setMonitorStatus("Error: All tokens failed // Authentication failed. Please ensure you are logged into Upwork in another tab and then click 'Check Now.");
    // Open Upwork search page to help re-establish tokens
    try {
      const searchUrl = constructUpworkSearchURL(userQueryToUse, config.DEFAULT_CONTRACTOR_TIERS_GQL, config.DEFAULT_SORT_CRITERIA);
      await browser.tabs.create({ url: searchUrl });
      await browser.runtime.sendMessage({ action: "updatePopupDisplay" });
    } catch (e) { console.warn("MV2: Error trying to open tab or send updatePopupDisplay message:", e); }
    return;
  }
  
  // Apply client-side title exclusion and skill-based low-priority marking
  if (fetchedJobs && fetchedJobs.length > 0) {
    const originalJobCount = fetchedJobs.length;
    let titleExcludedCount = 0;
    let skillLowPriorityCount = 0;
    let clientCountryLowPriorityCount = 0;

    fetchedJobs = fetchedJobs.map(job => {
      let newJobData = { ...job, isExcludedByTitleFilter: false, isLowPriorityBySkill: false, isLowPriorityByClientCountry: false };

      // 1. Apply TITLE based exclusion
      const titleLower = (job.title || "").toLowerCase(); // Ensure title is lowercase for comparison
      if (config.TITLE_EXCLUSION_STRINGS.length > 0 && config.TITLE_EXCLUSION_STRINGS.some(excludeString => titleLower.includes(excludeString))) {
        newJobData.isExcludedByTitleFilter = true;
        titleExcludedCount++;
      }

      // 2. Apply SKILL based low-priority marking
      // Ensure job.ontologySkills is an array and has items.
      // The API response shows skills under job.ontologySkills, each skill object has a prefLabel.
      if (Array.isArray(job.ontologySkills) && job.ontologySkills.length > 0 && config.SKILL_LOW_PRIORITY_TERMS.length > 0) {
        for (const skill of job.ontologySkills) {
          if (skill && skill.prefLabel && config.SKILL_LOW_PRIORITY_TERMS.includes(skill.prefLabel.toLowerCase())) {
            newJobData.isLowPriorityBySkill = true;
            skillLowPriorityCount++;
            break; // Found a matching low-priority skill, no need to check further for this job
          }
        }
      }

      // 3. Apply CLIENT COUNTRY based low-priority marking
      if (job.client && job.client.country && config.CLIENT_COUNTRY_LOW_PRIORITY.length > 0) {
        if (config.CLIENT_COUNTRY_LOW_PRIORITY.includes(job.client.country.toLowerCase())) {
          newJobData.isLowPriorityByClientCountry = true;
          clientCountryLowPriorityCount++;
        }
      }

      return newJobData;
    });
    console.log(`MV2: Processed ${originalJobCount} jobs. Marked ${titleExcludedCount} as excluded by title. Marked ${skillLowPriorityCount} as low-priority by skill. Marked ${clientCountryLowPriorityCount} as low-priority by client country.`);
  }


  // --- Deduplication and Notification (using fetchedJobs) ---
  const historicalSeenJobIds = await StorageManager.getSeenJobIds();
  const deletedJobIds = await StorageManager.getDeletedJobIds();
  let currentCollapsedJobIds = await StorageManager.getCollapsedJobIds(); // Get current collapsed IDs

  // Filter out jobs that are already seen OR have been explicitly deleted by the user from the *fetched* list
  const allNewOrUpdatedJobs = fetchedJobs.filter(job =>
    job && job.id && !historicalSeenJobIds.has(job.id) && !deletedJobIds.has(job.id)
  );
  // From these, determine which are truly new AND notifiable (not excluded by title filter)
  const notifiableNewJobs = allNewOrUpdatedJobs.filter(job =>
    !job.isExcludedByTitleFilter && !job.isLowPriorityBySkill && !job.isLowPriorityByClientCountry && job.applied !== true
  );

  // Update seenJobIds if any jobs were fetched
  if (fetchedJobs && fetchedJobs.length > 0) {
    const newJobIdsToMarkSeen = [];
    fetchedJobs.forEach(job => {
      if (job && job.id && !historicalSeenJobIds.has(job.id)) {
        newJobIdsToMarkSeen.push(job.id);
        // If it's a new, low-priority job, add to collapsedJobIds
        if ((job.isLowPriorityBySkill || job.isLowPriorityByClientCountry) && !currentCollapsedJobIds.has(job.id)) {
          currentCollapsedJobIds.add(job.id);
        }
      }
    });
    await StorageManager.addSeenJobIds(newJobIdsToMarkSeen);
  }
  if (notifiableNewJobs.length > 0) {
    notifiableNewJobs.forEach(job => sendNotification(job));
  }
  console.log(`MV2 DirectBG: Token Loop. Found ${allNewOrUpdatedJobs.length} new/updated jobs, ${notifiableNewJobs.length} are notifiable.`);

  // Update storage using StorageManager
  await StorageManager.setMonitorStatus(`Checked. New (notifiable): ${notifiableNewJobs.length}`);
  await StorageManager.setNewJobsInLastRun(notifiableNewJobs.length);
  await StorageManager.setLastCheckTimestamp(Date.now());
  await StorageManager.setRecentFoundJobs(fetchedJobs ? fetchedJobs.filter(job => job && job.id && !deletedJobIds.has(job.id)) : []);
  await StorageManager.setCollapsedJobIds(Array.from(currentCollapsedJobIds)); // Save updated collapsed IDs

  try {
    // browser.runtime.sendMessage returns a promise with the polyfill
    await browser.runtime.sendMessage({ action: "updatePopupDisplay" });
  } catch (e) { console.warn("MV2: Error sending updatePopupDisplay message post-check:", e); }
}
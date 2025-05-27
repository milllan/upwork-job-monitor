// content/content_script.js
console.log("Upwork Job Monitor: Content Script Loaded & Listening.");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fetchJobsFromContentScript") {
    console.log("Content Script: Received fetchJobs request.", request.payload);

    const bearerToken = request.payload.token;
    const graphqlPayload = request.payload.graphqlPayload;
    const tenantId = request.payload.tenantId; // Make sure background sends this

    if (!bearerToken || !graphqlPayload || !tenantId) {
      const errorMsg = "Content Script: Missing token, GraphQL payload, or tenantId.";
      console.error(errorMsg, request.payload);
      sendResponse({ success: false, error: errorMsg });
      return true; // Important for async when erroring early
    }

    const endpoint = "https://www.upwork.com/api/graphql/v1?alias=userJobSearch";

    fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${bearerToken}`,
        "Content-Type": "application/json",
        "Accept": "*/*",
        "X-Upwork-API-TenantId": tenantId, // Use the tenantId passed from background
        "X-Upwork-Accept-Language": "en-US" // Can be parameterized if needed
      },
      body: JSON.stringify(graphqlPayload),
    })
    .then(response => {
      if (!response.ok) {
        // Read the response body as text to include in the error
        return response.text().then(text => {
          // Construct an error object to send back
          const errorDetail = {
            status: response.status,
            statusText: response.statusText,
            body: text
          };
          console.error("Content Script: API request failed.", errorDetail);
          // Send a structured error back
          throw new Error(JSON.stringify(errorDetail));
        });
      }
      return response.json();
    })
    .then(data => {
      // Check for GraphQL errors within a 200 OK response
      if (data.errors) {
        console.warn("Content Script: GraphQL API returned errors within data.", data.errors);
        // Send these GraphQL errors back to the background script
        sendResponse({ success: true, data: { errors: data.errors } }); // Indicate success:false if this is a failure condition for you
      } else {
        console.log("Content Script: Successfully fetched data.", data);
        sendResponse({ success: true, data: data });
      }
    })
    .catch(error => {
      // This catches network errors or the error thrown from !response.ok
      console.error("Content Script: Error during fetch operation:", error.message);
      sendResponse({ success: false, error: error.message });
    });

    return true; // Crucial: indicates that sendResponse will be called asynchronously.
  }
});
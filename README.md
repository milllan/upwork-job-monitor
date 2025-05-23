# Upwork Job Monitor Browser Extension - Project Development Plan

## Project Overview
Build a Chrome/Firefox extension that monitors Upwork job feeds from within the browser, bypassing Cloudflare protection by operating in the authenticated user context.

## Architecture Decision: Browser Extension
**Why Extension Over Standalone App:**
- Bypasses Cloudflare bot detection
- Access to authenticated session cookies
- No CORS issues
- Direct DOM access for scraping if needed
- Persistent background operation

## Phase 1: Core Extension Foundation (MVP)
**Goal**: Basic extension that monitors one Upwork feed

### 1.1 Extension Structure
```
upwork-job-monitor/
├── manifest.json (v3)
├── background/
│   ├── service-worker.js
│   └── job-monitor.js
├── content/
│   ├── content-script.js
│   └── page-parser.js
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── options/
│   ├── options.html
│   └── options.js
└── storage/
    └── storage-manager.js
```

### 1.2 Core Components

#### Background Service Worker
- **Purpose**: Handles scheduling, API calls, and data management
- **Key Functions**:
  - Periodic job checking (5-10 minutes)
  - Bearer token management
  - Data storage coordination
  - Notification triggering

#### Content Script
- **Purpose**: Interact with Upwork pages when needed
- **Key Functions**:
  - Extract bearer token from cookies/localStorage
  - Parse job data from DOM if API fails
  - Monitor page changes
  - Inject monitoring indicators

#### Popup Interface
- **Purpose**: Quick status and controls
- **Features**:
  - Current monitoring status
  - Recent jobs found
  - Quick start/stop toggle
  - Settings shortcut

### 1.3 Authentication Strategy
```javascript
// Extract bearer token from cookies
async function getBearerToken() {
    const cookies = await chrome.cookies.getAll({
        domain: ".upwork.com"
    });
    
    const oauthToken = cookies.find(cookie => 
        cookie.name === "oauth2_global_js_token"
    );
    
    return oauthToken?.value;
}
```

### 1.4 Job Fetching Implementation
```javascript
// Primary method: GraphQL API
async function fetchJobsFromAPI(bearerToken) {
    const response = await fetch("https://www.upwork.com/api/graphql/v1", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${bearerToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            query: `query($limit: Int, $toTime: String) {
                mostRecentJobsFeed(limit: $limit, toTime: $toTime) {
                    jobs {
                        id
                        title
                        description
                        budget
                        postedOn
                        client { ... }
                        skills { ... }
                    }
                }
            }`,
            variables: { limit: 50 }
        })
    });
    
    return response.json();
}

// Fallback method: DOM parsing via content script
async function fetchJobsFromDOM() {
    const [tab] = await chrome.tabs.query({
        url: "*://*.upwork.com/nx/search/jobs*"
    });
    
    if (tab) {
        return chrome.tabs.sendMessage(tab.id, {
            action: "parseJobs"
        });
    }
}
```

### 1.5 Data Storage
```javascript
// Use Chrome storage API
class JobStorage {
    async saveJobs(jobs) {
        await chrome.storage.local.set({
            [`jobs_${Date.now()}`]: jobs,
            lastCheck: Date.now()
        });
    }
    
    async getRecentJobs(hours = 24) {
        const cutoff = Date.now() - (hours * 60 * 60 * 1000);
        const storage = await chrome.storage.local.get();
        
        return Object.entries(storage)
            .filter(([key]) => key.startsWith('jobs_'))
            .filter(([key]) => parseInt(key.split('_')[1]) > cutoff)
            .flatMap(([, jobs]) => jobs);
    }
}
```

## Phase 2: Enhanced Monitoring & Multi-Feed
**Goal**: Support multiple search pages and improved filtering

### 2.1 Multi-Feed Configuration
```javascript
// Feed configuration structure
const feedConfigs = [
    {
        id: "best_match",
        name: "Best Match",
        url: "https://www.upwork.com/nx/search/jobs/?q=javascript&sort=recency",
        enabled: true,
        checkInterval: 5 // minutes
    },
    {
        id: "react_jobs",
        name: "React Jobs", 
        url: "https://www.upwork.com/nx/search/jobs/?q=react&sort=recency",
        enabled: true,
        checkInterval: 10
    }
];
```

### 2.2 Advanced Job Processing
- **Deduplication**: Cross-feed duplicate detection
- **Filtering**: Keyword filters, budget ranges, client ratings
- **Categorization**: Auto-categorize jobs by type/technology
- **Priority Scoring**: Rate jobs based on match criteria

### 2.3 Options Page
- Feed management interface
- Filter configuration
- Notification settings
- Token status and refresh

## Phase 3: Notification System
**Goal**: Real-time alerts via multiple channels

### 3.1 Browser Notifications
```javascript
// Native Chrome notifications
function showJobNotification(job) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon-48.png',
        title: 'New Upwork Job!',
        message: `${job.title}\nBudget: ${job.budget}`,
        buttons: [
            { title: 'View Job' },
            { title: 'Dismiss' }
        ]
    });
}
```

### 3.2 Telegram Integration
```javascript
// Telegram bot webhook
async function sendTelegramAlert(job, chatId, botToken) {
    const message = `
🔔 *New Upwork Job Alert*

*Title:* ${job.title}
*Budget:* ${job.budget}
*Posted:* ${job.postedOn}
*Client Rating:* ${job.client.rating}

*Description:*
${job.description.substring(0, 300)}...

[View Job](${job.url})
    `;
    
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown'
        })
    });
}
```

### 3.3 Email Notifications (Optional)
- Integration with email services
- Daily/weekly digest options
- HTML formatted job summaries

## Phase 4: Advanced Features
**Goal**: Analytics and optimization tools

### 4.1 Job Analytics Dashboard
- Job market trends
- Response time tracking  
- Success rate correlation
- Competition analysis

### 4.2 Auto-Application Features (Advanced)
- Template responses
- Proposal generation assistance
- Application tracking
- Follow-up reminders

## Development Milestones

### Week 1: Extension Setup
- [ ] Create manifest.json and basic structure
- [ ] Implement bearer token extraction
- [ ] Basic service worker setup
- [ ] Simple popup interface

### Week 2: Core Monitoring
- [ ] Job fetching via GraphQL API
- [ ] Data storage implementation
- [ ] Basic job comparison/deduplication
- [ ] Periodic checking scheduler

### Week 3: Content Script Integration
- [ ] DOM parsing fallback
- [ ] Page interaction capabilities
- [ ] Visual indicators on Upwork pages
- [ ] Error handling and logging

### Week 4: Multi-Feed Support
- [ ] Feed configuration system
- [ ] Options page development
- [ ] Cross-feed deduplication
- [ ] Performance optimization

### Week 5: Notification System
- [ ] Browser notifications
- [ ] Telegram bot integration
- [ ] Notification preferences
- [ ] Alert customization

### Week 6: Polish & Testing
- [ ] Comprehensive testing
- [ ] UI/UX improvements
- [ ] Documentation
- [ ] Extension store preparation

## Technical Considerations

### Manifest V3 Compliance
```json
{
    "manifest_version": 3,
    "name": "Upwork Job Monitor",
    "version": "1.0",
    "permissions": [
        "storage",
        "cookies",
        "notifications",
        "alarms",
        "activeTab"
    ],
    "host_permissions": [
        "*://*.upwork.com/*"
    ],
    "background": {
        "service_worker": "background/service-worker.js"
    },
    "content_scripts": [{
        "matches": ["*://*.upwork.com/*"],
        "js": ["content/content-script.js"]
    }]
}
```

### Rate Limiting Strategy
- Respect Upwork's rate limits
- Implement exponential backoff
- Queue requests to avoid overwhelming
- Monitor for API blocks

### Error Handling
- Token expiration detection
- API failure fallbacks
- Network error recovery
- User-friendly error messages

### Privacy & Security
- Secure token storage
- No data transmission to external servers
- Clear privacy policy
- User consent for notifications

## Deployment Strategy

### Development
- Chrome Developer Mode loading
- Hot reload for development
- Debug logging and testing tools

### Distribution
- Chrome Web Store submission
- Firefox Add-ons store
- Documentation and user guides
- Update mechanism

## Risk Mitigation

### API Changes
- Fallback to DOM parsing
- Version compatibility checks
- Update notification system

### Token Management
- Automatic token refresh detection
- User guidance for re-authentication
- Graceful degradation when offline

### Performance
- Efficient storage management  
- Background processing limits
- Memory optimization
- Battery usage consideration

This browser extension approach will be much more reliable for bypassing Cloudflare protection while providing all the monitoring functionality you need. The extension operates within the user's authenticated browser session, making it appear as legitimate user activity rather than automated bot traffic.
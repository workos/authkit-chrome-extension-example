import { authkit } from '../../authkit/authkit';
import { getServiceWorkerClient } from '../../authkit/serviceWorkerClient';

console.log('background script loaded');

// Initialize the service worker client for session management
const swClient = getServiceWorkerClient();

// Start periodic session refresh for phone call use case
let stopPeriodicRefresh: (() => void) | null = null;

// Set up a listener for messages from the content script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('Received message:', message);

  if (message.action === 'terminateSession') {
    handleSessionTermination()
      .then(() => sendResponse({ success: true }))
      .catch(error => {
        console.error('Error terminating session:', error);
        sendResponse({ success: false, error: error.message });
      });

    // Return true to indicate that sendResponse will be called asynchronously
    return true;
  }

  if (message.action === 'sessionActive') {
    console.log('Session confirmed active by popup - phone call maintenance active');
    
    // Stop existing refresh if running
    if (stopPeriodicRefresh) {
      stopPeriodicRefresh();
    }
    
    // Start simplified phone call maintenance (no API refresh needed)
    stopPeriodicRefresh = startPhoneCallMaintenance();
    
    sendResponse({ success: true });
    return true;
  }
});

async function handleSessionTermination() {
  try {
    // Stop the periodic refresh
    if (stopPeriodicRefresh) {
      stopPeriodicRefresh();
      stopPeriodicRefresh = null;
    }

    // Use authkit's comprehensive cookie clearing method
    await authkit.clearSessionCookie();

  } catch (error) {
    console.error('Error during session termination:', error);
    throw error;
  }
}

// Listen for when a tab is updated (page loaded) to detect new sessions
chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  if (tab.url?.includes('localhost:3000') && changeInfo.status === 'complete') {
    // Check if there's a session and start phone call maintenance
    if (await swClient.hasActiveSession()) {
      console.log('Session detected on AuthKit-enabled website - starting phone call maintenance');
      
      // Stop existing maintenance if running
      if (stopPeriodicRefresh) {
        stopPeriodicRefresh();
      }
      
      // Start new phone call maintenance
      stopPeriodicRefresh = startPhoneCallMaintenance();
    }
  }
});

// Simplified phone call maintenance that doesn't try to refresh tokens
function startPhoneCallMaintenance(): () => void {
  console.log('Starting phone call maintenance...');
  
  const intervalId = setInterval(async () => {
    // Check if session cookies still exist
    if (await swClient.hasActiveSession()) {
      console.log('Phone call maintenance ping - session active');
      // Here you would make your phone service API call
      // await fetch('/api/phone/keep-alive', { ... });
    } else {
      console.log('Session expired - phone call maintenance stopped');
      if (stopPeriodicRefresh) {
        stopPeriodicRefresh();
        stopPeriodicRefresh = null;
      }
    }
  }, 30000); // Every 30 seconds

  // Return cleanup function
  return () => {
    clearInterval(intervalId);
    console.log('Phone call maintenance stopped');
  };
}

// Check for existing session on startup
swClient.hasActiveSession().then(hasSession => {
  if (hasSession) {
    console.log('Existing session found on startup - starting phone call maintenance');
    stopPeriodicRefresh = startPhoneCallMaintenance();
  }
});

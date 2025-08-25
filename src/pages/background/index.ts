import { authkit } from '../../authkit/authkit';
import { getServiceWorkerClient } from '../../authkit/serviceWorkerClient';
import { getTokenRefresher } from '../../authkit/tokenRefresher';

console.log('background script loaded');

// Initialize the service worker client for session management
const swClient = getServiceWorkerClient();
const tokenRefresher = getTokenRefresher();

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
    console.log('Session confirmed active by popup - starting token refresh');
    
    // Stop existing refresh if running
    if (stopPeriodicRefresh) {
      stopPeriodicRefresh();
    }
    
    // Start token refresh management
    tokenRefresher.startTokenRefresh();
    
    // Also start simplified phone call maintenance
    stopPeriodicRefresh = startPhoneCallMaintenance();
    
    sendResponse({ success: true });
    return true;
  }
});

async function handleSessionTermination() {
  try {
    // Stop token refresh
    tokenRefresher.stopTokenRefresh();
    
    // Stop the periodic refresh
    if (stopPeriodicRefresh) {
      stopPeriodicRefresh();
      stopPeriodicRefresh = null;
    }

    // Use authkit's comprehensive session clearing method
    await authkit.clearSessionStorage();

  } catch (error) {
    console.error('Error during session termination:', error);
    throw error;
  }
}

// Listen for when a tab is updated (page loaded) to detect new sessions
chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  if (tab.url?.includes('localhost') && changeInfo.status === 'complete') {
    // Check if there's a session and start token refresh
    const auth = await authkit.withAuth();
    if (auth.user) {
      console.log('Session detected on AuthKit-enabled website - starting token refresh');
      
      // Start token refresh management
      tokenRefresher.startTokenRefresh();
      
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
authkit.withAuth().then(auth => {
  if (auth.user) {
    console.log('Existing session found on startup - starting token refresh and phone call maintenance');
    tokenRefresher.startTokenRefresh();
    stopPeriodicRefresh = startPhoneCallMaintenance();
  }
});

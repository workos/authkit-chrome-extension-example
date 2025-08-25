import { authkit } from '../../authkit/authkit';
import { getTokenRefresher } from '../../authkit/tokenRefresher';

console.log('background script loaded');

// Initialize the token refresher for session management
const tokenRefresher = getTokenRefresher();

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
    
    // Start token refresh management
    tokenRefresher.startTokenRefresh();
    
    sendResponse({ success: true });
    return true;
  }
});

async function handleSessionTermination() {
  try {
    // Stop token refresh
    tokenRefresher.stopTokenRefresh();

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
    }
  }
});


// Check for existing session on startup
authkit.withAuth().then(auth => {
  if (auth.user) {
    console.log('Existing session found on startup - starting token refresh');
    tokenRefresher.startTokenRefresh();
  }
});

import { authkit } from '../../authkit/authkit';
import { sessionManager } from '../../authkit/sessionManager';

console.log('background script loaded');
sessionManager.startSessionManagement();

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
});

async function handleSessionTermination() {
  try {
    // Get the full authentication state
    const { user, accessToken, refreshToken } = await authkit.withAuth(void 0);

    if (!user || !accessToken || !refreshToken) {
      console.log('No active session to terminate');
      return;
    }

    await chrome.cookies.remove({
      name: 'wos-session',
      url: 'http://localhost:3000',
    });

    console.log('Session terminated successfully');

    // Stop the session management
    if (sessionManager) {
      sessionManager.stopSessionManagement();
      try {
        const { logoutUrl } = await authkit.getLogoutUrl({ user, accessToken, refreshToken }, void 0);
        // officially end the session on the server
        await fetch(logoutUrl, {
          method: 'GET',
          mode: 'no-cors',
          credentials: 'include',
        });
      } catch {
        // don't throw if this fails
      }
    }
  } catch (error) {
    console.error('Error during session termination:', error);
    throw error;
  }
}

// Listen for when a tab is updated (page loaded)
chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  if (tab.url?.includes('localhost:3000') && changeInfo.status === 'complete') {
    const auth = await authkit.withAuth(void 0);
    // console.log('AUTH', auth);

    if (auth.user) {
      sessionManager.startSessionManagement();
    }
  }
});

// Also check when extension icon is clicked
chrome.action.onClicked.addListener(() => {
  sessionManager.startSessionManagement();
});

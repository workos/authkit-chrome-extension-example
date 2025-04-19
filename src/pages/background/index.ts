import { authkit } from '../../authkit/authkit';
import { sessionManager } from '../../authkit/sessionManager';

console.log('background script loaded');
sessionManager.startSessionManagement();

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

    // This will need to be adapted based on your actual implementation
    // You need to reconstruct or retrieve the full session object
    // const session = {
    //   accessToken,
    //   refreshToken,
    //   user,
    //   impersonator: impersonator,
    // };

    // Terminate the session - you'll need to implement this based on your authkit structure
    // This might involve:
    // 1. Clearing the cookie
    // 2. Potentially making a call to the server to invalidate the session

    // For a basic implementation, you might just clear the session cookie:
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
  // console.log('CHECKING HERE', tabId, tab, changeInfo);
  // Check if it's a localhost URL and page is done loading
  // console.log('changeInfo', changeInfo);
  if (tab.url?.includes('authkit.test') && changeInfo.status === 'complete') {
    const auth = await authkit.withAuth(void 0);
    // console.log('AUTH', auth);

    if (auth.user) {
      sessionManager.startSessionManagement();
    }

    // Get cookies after the page loads
    // chrome.cookies.getAll({ url: 'https://authkit.test/' }, cookies => {
    //   console.log('Cookies for localhost:3000:');
    //   console.log(cookies);
    // });

    // Try with different parameters
    // chrome.cookies.getAll({}, allCookies => {
    //   console.log('ALL cookies in browser:');
    //   console.log(allCookies);
    //
    //   // Filter manually to find localhost cookies
    //   const localCookies = allCookies.filter(
    //     cookie => cookie.domain === 'localhost' || cookie.domain.includes('localhost'),
    //   );
    //
    //   console.log('Filtered localhost cookies:');
    //   console.log(localCookies);
    // });
  }
});

// Also check when extension icon is clicked
chrome.action.onClicked.addListener(() => {
  // console.log('CLICKED TAB', tab);
  sessionManager.startSessionManagement();
  // chrome.cookies.getAll({ url: 'https://authkit.test/' }, cookies => {
  //   console.log('Cookies on extension click:');
  //   console.log(cookies);
  // });
});

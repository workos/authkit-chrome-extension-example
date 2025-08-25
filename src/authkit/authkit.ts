import { getAuthkitClient } from './client';
import { findAndUnsealSession } from './session';
import conf from '../../config.json';

/**
 * AuthKit interface for Chrome extension.
 * Provides a simplified API that wraps authkit-js client.
 */
export const authkit = {
  /**
   * Get current authentication status and user information.
   * @returns Authentication result with user data if authenticated
   */
  async withAuth() {
    const client = await getAuthkitClient();
    
    if (client) {
      const user = client.getUser();
      
      if (user) {
        try {
          const accessToken = await client.getAccessToken();
          
          return {
            user,
            accessToken,
            claims: null,
            sessionId: null,
            impersonator: null,
            refreshToken: null
          };
        } catch {
          // Fall through to cookie-based approach
        }
      }
    }
    return await this.checkStorageBasedSession();
  },

  /**
   * Check for session using localStorage (AuthKit React devMode=true) or cookies
   */
  async checkStorageBasedSession() {
    try {
      const sessionData = await findAndUnsealSession();
      
      if (!sessionData) {
        return {
          user: null,
          accessToken: null,
          claims: null,
          sessionId: null,
          impersonator: null,
          refreshToken: null
        };
      }
      
      // Check if we got a session detected marker but couldn't decode user data
      if (sessionData.sessionDetected && !sessionData.user) {
        
        // Return placeholder data indicating session exists but details unavailable
        return {
          user: {
            email: `session-detected@${sessionData.cookieName}`,
            firstName: 'Session',
            lastName: 'Detected',
            id: sessionData.cookieName
          },
          accessToken: 'session-detected',
          claims: null,
          sessionId: sessionData.cookieName,
          impersonator: null,
          refreshToken: null
        };
      }
      
      // Handle localStorage sessions (AuthKit React devMode=true)
      if (sessionData.source === 'localStorage') {
        // If we have user data and access token, return it directly
        if (sessionData.user && sessionData.accessToken) {
          const user = sessionData.user;
          return {
            user: {
              email: user.email,
              firstName: user.first_name || user.firstName,
              lastName: user.last_name || user.lastName,
              id: user.id
            },
            accessToken: sessionData.accessToken,
            claims: sessionData.claims,
            sessionId: sessionData.sessionId,
            impersonator: sessionData.impersonator,
            refreshToken: sessionData.refreshToken,
            source: sessionData.source
          };
        }
        
        // If we only have a refresh token, try to use authkit-js to get the session
        if (sessionData.refreshToken) {
          const client = await getAuthkitClient();
          if (client) {
            try {
              const user = client.getUser();
              const accessToken = await client.getAccessToken();
              
              if (user && accessToken) {
                return {
                  user,
                  accessToken,
                  claims: null,
                  sessionId: null,
                  impersonator: sessionData.impersonator,
                  refreshToken: sessionData.refreshToken
                };
              }
            } catch {
              // Fall through to placeholder session
            }
          }
          
          // If authkit-js client doesn't work, return a placeholder session
          return {
            user: {
              email: 'authenticated-user@extension.local',
              firstName: 'Authenticated',
              lastName: 'User',
              id: 'extension-session'
            },
            accessToken: 'extension-session-token',
            claims: sessionData.claims,
            sessionId: sessionData.sessionId,
            impersonator: sessionData.impersonator,
            refreshToken: sessionData.refreshToken,
            source: sessionData.source
          };
        }
      }
      
      // Extract user data from unsealed session (cookie-based)
      const user = sessionData.user || sessionData;
      
      return {
        user: {
          email: user.email,
          firstName: user.first_name || user.firstName,
          lastName: user.last_name || user.lastName,
          id: user.id
        },
        accessToken: sessionData.access_token || sessionData.accessToken,
        claims: sessionData.claims || null,
        sessionId: sessionData.session_id || sessionData.sessionId,
        impersonator: sessionData.impersonator || null,
        refreshToken: sessionData.refresh_token || sessionData.refreshToken,
        source: sessionData.source,
        originalFormat: sessionData.originalFormat,
        cookieName: sessionData.cookieName,
        originalCookieValue: sessionData.originalCookieValue
      };
      
    } catch {
      return {
        user: null,
        accessToken: null,
        claims: null,
        sessionId: null,
        impersonator: null,
        refreshToken: null
      };
    }
  },

  /**
   * Sign out and optionally get logout URL.
   * @param session - Current authentication state  
   * @param _ - Unused parameter for compatibility
   * @returns Promise that resolves when logout is complete
   */
  async signOut() {
    try {
      // Use authkit-js to do proper server-side session termination
      const client = await getAuthkitClient();
      if (client) {
        await client.signOut({ navigate: false });
      }
      
      // Clear cookies and localStorage as backup (in case authkit-js didn't clear everything)
      await this.clearSessionStorage();
    } catch (error) {
      console.error('Error during signOut:', error);
      // Even if server-side logout fails, still try to clear local cookies
      try {
        await this.clearSessionStorage();
      } catch (cookieError) {
        console.error('Failed to clear cookies:', cookieError);
      }
    }
  },

  /**
   * Clear AuthKit session cookies and localStorage from the domain
   */
  async clearSessionStorage() {
    // First, clear localStorage from any matching tabs
    await this.clearSessionLocalStorage();
    
    // Then clear cookies
    const conf = await import('../../config.json');
    
    // Get all cookies from the domain - try both HTTP and potential HTTPS
    const urls = [conf.cookieDomain];
    if (conf.cookieDomain.startsWith('http://')) {
      urls.push(conf.cookieDomain.replace('http://', 'https://'));
    }
    
    let allCookies: chrome.cookies.Cookie[] = [];
    for (const url of urls) {
      try {
        const cookies = await chrome.cookies.getAll({ url });
        allCookies = allCookies.concat(cookies);
      } catch {
        // Silently continue if URL doesn't work
      }
    }
    
    // Also try to get cookies for localhost domain
    try {
      const localhostCookies = await chrome.cookies.getAll({ domain: 'localhost' });
      allCookies = allCookies.concat(localhostCookies);
    } catch {
      // Silently continue
    }
    
    // Find and remove AuthKit session cookies
    for (const cookie of allCookies) {
      if (cookie.name.includes('wos-session') || 
          cookie.name.includes('workos') ||
          cookie.name.includes('session') ||
          cookie.name === 'authkit-session') {
        
        // Construct proper URL for cookie removal
        const protocol = cookie.secure ? 'https://' : 'http://';
        const domain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
        const url = `${protocol}${domain}${cookie.path}`;
        
        try {
          await chrome.cookies.remove({
            url: url,
            name: cookie.name
          });
        } catch (error) {
          console.error(`Failed to remove cookie ${cookie.name}:`, error);
        }
      }
    }
  },

  /**
   * Clear AuthKit session data from localStorage
   */
  async clearSessionLocalStorage() {
    try {
      // Get all tabs that match our domain
      const tabs = await chrome.tabs.query({
        url: conf.cookieDomain + "/*"
      });
      
      if (tabs.length === 0) {
        return;
      }
      
      // Execute script in each matching tab to clear localStorage
      for (const tab of tabs) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            func: () => {
              // Clear all WorkOS-related localStorage keys - both formats
              const keysToRemove = [
                'workos:refresh-token',
                'workos:access-token', 
                'workos:user',
                'workos:impersonator',
                'workos.refresh_token',
                'workos.access_token',
                'workos.user',
                'workos.impersonator'
              ];
              
              keysToRemove.forEach(key => {
                localStorage.removeItem(key);
              });
              
            }
          });
        } catch (error) {
          console.warn(`Failed to clear localStorage for tab ${tab.id}:`, error);
        }
      }
    } catch (error) {
      console.warn('Failed to clear localStorage session data:', error);
    }
  },

  /**
   * Get logout URL for session termination (for compatibility).
   * @param session - Current authentication state
   * @param _ - Unused parameter for compatibility  
   * @returns Object containing logout URL
   */
  async getLogoutUrl() {
    const client = await getAuthkitClient();
    
    if (!client) {
      return { logoutUrl: 'about:blank' };
    }
    
    const sessionData = await this.checkStorageBasedSession();
    if (sessionData.user) {
      // For now, we'll perform logout directly since authkit-js doesn't expose URL generation
      await this.signOut();
      return { logoutUrl: 'about:blank' }; // Placeholder since we don't need the URL
    }
    
    throw new Error('No active session to terminate');
  }
};

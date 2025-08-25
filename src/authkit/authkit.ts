import { getAuthkitClient } from './client';
import { findAndUnsealSession } from './sessionUnseal';

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
        } catch (error) {
          // Fall through to cookie-based approach
        }
      }
    }
    return await this.checkCookieBasedSession();
  },

  /**
   * Check for session using Chrome cookies API and make direct WorkOS API call
   */
  async checkCookieBasedSession() {
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
      
      // Extract user data from unsealed session
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
        refreshToken: sessionData.refresh_token || sessionData.refreshToken
      };
      
    } catch (error) {
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
  async signOut(session: any, _?: any) {
    try {
      // Use authkit-js to do proper server-side session termination
      const client = await getAuthkitClient();
      if (client) {
        await client.signOut({ navigate: false });
      }
      
      // Clear cookies as backup (in case authkit-js didn't clear everything)
      await this.clearSessionCookie();
    } catch (error) {
      console.error('Error during signOut:', error);
      // Even if server-side logout fails, still try to clear local cookies
      try {
        await this.clearSessionCookie();
      } catch (cookieError) {
        console.error('Failed to clear cookies:', cookieError);
      }
    }
  },

  /**
   * Clear AuthKit session cookies from the domain
   */
  async clearSessionCookie() {
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
      } catch (error) {
        // Silently continue if URL doesn't work
      }
    }
    
    // Also try to get cookies for localhost domain
    try {
      const localhostCookies = await chrome.cookies.getAll({ domain: 'localhost' });
      allCookies = allCookies.concat(localhostCookies);
    } catch (error) {
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
   * Get logout URL for session termination (for compatibility).
   * @param session - Current authentication state
   * @param _ - Unused parameter for compatibility  
   * @returns Object containing logout URL
   */
  async getLogoutUrl(session: any, _: any) {
    const client = await getAuthkitClient();
    
    if (!client) {
      console.log('AuthKit client not available for getLogoutUrl');
      return { logoutUrl: 'about:blank' };
    }
    
    if (session.user) {
      // For now, we'll perform logout directly since authkit-js doesn't expose URL generation
      await this.signOut(session);
      return { logoutUrl: 'about:blank' }; // Placeholder since we don't need the URL
    }
    
    throw new Error('No active session to terminate');
  }
};

import { authkit } from './authkit';
import { isTokenExpiring, parseJwtClaims } from './jwtUtils';
import conf from '../../config.json';

interface SessionData {
  user: any;
  accessToken: string;
  refreshToken: string;
  claims?: any;
  sessionId?: string;
  impersonator?: any;
  source?: 'localStorage' | 'cookie';
}

interface WorkOSTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: any;
  impersonator?: any;
}

/**
 * TokenRefresher handles automatic token refresh using SessionManager-style timing
 * Recreates the original SessionManager functionality but with direct API calls
 */
export class TokenRefresher {
  private refreshInterval?: ReturnType<typeof setInterval>;
  private readonly checkIntervalMs = 10000; // 10 seconds, same as original SessionManager
  private readonly refreshBufferSeconds = 300; // 5 minutes, same as original
  private isRefreshing = false;

  /**
   * Start automatic token refresh monitoring
   */
  startTokenRefresh() {
    if (this.refreshInterval) {
      return; // already running
    }

    console.log('Starting token refresh management');
    this.refreshInterval = setInterval(() => this.checkAndRefreshSession(), this.checkIntervalMs);

    // Check immediately, same as original SessionManager
    this.checkAndRefreshSession();
  }

  /**
   * Stop automatic token refresh monitoring
   */
  stopTokenRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = undefined;
      console.log('Token refresh management stopped');
    }
  }

  /**
   * Check session status and refresh if necessary
   * Recreates the original SessionManager.checkAndRefreshSession logic
   */
  private async checkAndRefreshSession() {
    if (this.isRefreshing) {
      return; // Don't run multiple refreshes simultaneously
    }

    try {
      console.log('Checking session status...');
      // Always get fresh session data to ensure we have the latest refresh token
      const auth = await authkit.checkStorageBasedSession();

      if (!auth.user) {
        console.log('No active session found.');
        return;
      }

      if (!auth.accessToken) {
        console.log('No access token available.');
        return;
      }

      // Check if token is expiring using our JWT utils
      if (isTokenExpiring(auth.accessToken, this.refreshBufferSeconds)) {
        console.log('Token expiring soon, refreshing...');
        await this.refreshTokens(auth as SessionData);
      } else {
        const claims = parseJwtClaims(auth.accessToken);
        if (claims?.exp) {
          const currentTime = Math.floor(Date.now() / 1000);
          const timeRemaining = claims.exp - currentTime;
          console.log(`Token valid for ${Math.floor(timeRemaining / 60)} more minutes`);
        }
      }
    } catch (error) {
      console.error('Error checking session:', error);
    }
  }

  /**
   * Refresh tokens using direct WorkOS API call
   * Replaces the original authkit.refreshSession() call
   */
  private async refreshTokens(sessionData: SessionData) {
    if (!sessionData.refreshToken) {
      console.log('Cannot refresh: no refresh token available');
      return;
    }

    this.isRefreshing = true;
    
    try {
      console.log('Refreshing tokens via WorkOS API...');
      
      const response = await fetch('https://api.workos.com/user_management/authenticate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: sessionData.refreshToken,
          client_id: conf.clientId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Token refresh failed: ${response.status} ${errorText}`);
      }

      const tokenResponse: WorkOSTokenResponse = await response.json();
      
      console.log('Tokens refreshed successfully');
      
      // Create updated session data
      const updatedSession = {
        user: tokenResponse.user,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        claims: parseJwtClaims(tokenResponse.access_token),
        sessionId: sessionData.sessionId,
        impersonator: tokenResponse.impersonator,
        source: sessionData.source,
      };

      // Save the updated session back to the original source
      await this.saveUpdatedSession(updatedSession);
      
      console.log('Updated session saved successfully');
      
    } catch (error) {
      console.error('Error refreshing tokens:', error);
      // TODO: Add retry logic and handle refresh failures
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Save updated session data back to the original source (localStorage or cookies)
   * This replaces the original authkit.saveSession() functionality
   */
  private async saveUpdatedSession(sessionData: SessionData) {
    try {
      if (sessionData.source === 'localStorage') {
        await this.saveToLocalStorage(sessionData);
      } else {
        await this.saveToCookies(sessionData);
      }
    } catch (error) {
      console.error('Error saving updated session:', error);
      throw error;
    }
  }

  /**
   * Save session data to localStorage (for AuthKit React devMode=true)
   */
  private async saveToLocalStorage(sessionData: SessionData) {
    // Get tabs that match our domain to inject script
    const tabs = await chrome.tabs.query({
      url: conf.cookieDomain + "/*"
    });
    
    if (tabs.length === 0) {
      console.warn('No matching tabs found to update localStorage');
      return;
    }

    // Execute script in the first matching tab to update localStorage
    await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id! },
      func: (accessToken, refreshToken, userString) => {
        // Update localStorage with new tokens
        localStorage.setItem('workos:access-token', accessToken);
        localStorage.setItem('workos:refresh-token', refreshToken);
        if (userString) {
          localStorage.setItem('workos:user', userString);
        }
        console.log('localStorage updated with refreshed tokens');
      },
      args: [
        sessionData.accessToken,
        sessionData.refreshToken,
        JSON.stringify(sessionData.user)
      ]
    });
  }

  /**
   * Save session data to cookies (for AuthKit Next.js and other cookie-based sessions)
   * This is more complex as we need to re-encrypt the session data
   */
  private async saveToCookies(sessionData: SessionData) {
    // For now, just log - cookie encryption is complex
    // TODO: Implement cookie re-encryption using iron-session or similar
    console.log('Cookie update needed but not yet implemented');
    console.log('New tokens available:', {
      accessToken: sessionData.accessToken.slice(-10),
      refreshToken: sessionData.refreshToken.slice(-10),
    });
  }
}

// Export singleton instance
let tokenRefresher: TokenRefresher | null = null;

export function getTokenRefresher(): TokenRefresher {
  if (!tokenRefresher) {
    tokenRefresher = new TokenRefresher();
  }
  return tokenRefresher;
}
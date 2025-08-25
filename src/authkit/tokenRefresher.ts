import { authkit } from './authkit';
import { isTokenExpiring, parseJwtClaims } from './jwtUtils';
import { sealSession } from './session';
import type { SessionData as IronSessionData } from './session';
import conf from '../../config.json';

// Import proper types from workos-node for consistency
interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  profilePictureUrl: string | null;
  firstName: string | null;
  lastName: string | null;
  lastSignInAt: string | null;
  createdAt: string;
  updatedAt: string;
  externalId: string | null;
  metadata: Record<string, string>;
}

type Impersonator = {
  email: string;
  reason: string | null;
} | null;

interface SessionData {
  user: User;
  accessToken: string;
  refreshToken: string;
  claims?: Record<string, unknown> | null;
  sessionId?: string | null;
  impersonator?: Impersonator;
  source?: 'localStorage' | 'cookie';
  originalFormat?: string;
  cookieName?: string;
  originalCookieValue?: string;
}

interface WorkOSUserResponse {
  object: 'user';
  id: string;
  email: string;
  email_verified: boolean;
  profile_picture_url: string | null;
  first_name: string | null;
  last_name: string | null;
  last_sign_in_at: string | null;
  created_at: string;
  updated_at: string;
  external_id?: string;
  metadata?: Record<string, string>;
}

interface WorkOSTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: WorkOSUserResponse;
  impersonator?: {
    email: string;
    reason: string | null;
  } | null;
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
      // Always get fresh session data to ensure we have the latest refresh token
      const auth = await authkit.checkStorageBasedSession();

      if (!auth.user) {
        return;
      }

      if (!auth.accessToken) {
        return;
      }

      // Check if token is expiring using our JWT utils
      if (isTokenExpiring(typeof auth.accessToken === 'string' ? auth.accessToken : '', this.refreshBufferSeconds)) {
        // Ensure we have all required fields for SessionData with proper type conversion
        const sessionData: SessionData = {
          user: auth.user as User,
          accessToken: typeof auth.accessToken === 'string' ? auth.accessToken : '',
          refreshToken: typeof auth.refreshToken === 'string' ? auth.refreshToken : '',
          claims: auth.claims || null,
          sessionId: typeof auth.sessionId === 'string' ? auth.sessionId : null,
          impersonator:
            auth.impersonator && typeof auth.impersonator === 'object' && 'email' in auth.impersonator
              ? (auth.impersonator as Impersonator)
              : null,
          source: auth.source as 'localStorage' | 'cookie',
          originalFormat: auth.originalFormat,
          cookieName: auth.cookieName,
          originalCookieValue: auth.originalCookieValue,
        };
        await this.refreshTokens(sessionData);
      } else {
        const accessToken = typeof auth.accessToken === 'string' ? auth.accessToken : '';
        const claims = parseJwtClaims(accessToken);
        if (claims?.exp) {
          const currentTime = Math.floor(Date.now() / 1000);
          const timeRemaining = claims.exp - currentTime;
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
      return;
    }

    this.isRefreshing = true;

    try {
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

      // Create updated session data with proper field mapping
      // Convert snake_case WorkOS API response to camelCase AuthKit session format
      const updatedSession = {
        user: {
          // Map snake_case API response to camelCase session format
          object: tokenResponse.user.object,
          id: tokenResponse.user.id,
          email: tokenResponse.user.email,
          emailVerified: tokenResponse.user.email_verified ?? false,
          profilePictureUrl: tokenResponse.user.profile_picture_url ?? null,
          firstName: tokenResponse.user.first_name,
          lastName: tokenResponse.user.last_name,
          lastSignInAt: tokenResponse.user.last_sign_in_at ?? null,
          createdAt: tokenResponse.user.created_at,
          updatedAt: tokenResponse.user.updated_at,
          externalId: tokenResponse.user.external_id ?? null,
          metadata: tokenResponse.user.metadata ?? {},
        },
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        claims: parseJwtClaims(tokenResponse.access_token),
        sessionId: sessionData.sessionId,
        impersonator: tokenResponse.impersonator || null,
        source: sessionData.source,
        originalFormat: sessionData.originalFormat,
        cookieName: sessionData.cookieName,
        originalCookieValue: sessionData.originalCookieValue,
      };

      // Save the updated session back to the original source
      await this.saveUpdatedSession(updatedSession);
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
      url: conf.cookieDomain + '/*',
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
      },
      args: [sessionData.accessToken, sessionData.refreshToken, JSON.stringify(sessionData.user)],
    });
  }

  /**
   * Save session data to cookies (for AuthKit Next.js and other cookie-based sessions)
   */
  private async saveToCookies(sessionData: SessionData) {
    if (!sessionData.cookieName || !sessionData.originalFormat) {
      console.warn('Missing cookie metadata for sealing - cannot update cookie');
      console.log('New tokens available:', {
        accessToken: sessionData.accessToken.slice(-10),
        refreshToken: sessionData.refreshToken.slice(-10),
      });
      return;
    }

    try {
      // Prepare session data for sealing (match iron-session format exactly)
      const sessionForSealing: IronSessionData = {
        accessToken: sessionData.accessToken, // camelCase, not snake_case
        refreshToken: sessionData.refreshToken, // camelCase, not snake_case
        user: {
          id: sessionData.user.id,
          email: sessionData.user.email,
          firstName: sessionData.user.firstName || undefined,
          lastName: sessionData.user.lastName || undefined,
          emailVerified: sessionData.user.emailVerified,
          profilePictureUrl: sessionData.user.profilePictureUrl,
          lastSignInAt: sessionData.user.lastSignInAt,
          createdAt: sessionData.user.createdAt,
          updatedAt: sessionData.user.updatedAt,
          externalId: sessionData.user.externalId,
          metadata: sessionData.user.metadata,
        },
        impersonator: sessionData.impersonator,
      };

      // Seal the session using iron-session compatible format
      const sealedSession = await sealSession(sessionForSealing);

      // Update the cookie
      await chrome.cookies.set({
        url: conf.cookieDomain,
        name: sessionData.cookieName,
        value: sealedSession,
        httpOnly: true,
        secure: conf.cookieDomain.startsWith('https:'),
        sameSite: 'lax',
      });
    } catch (error) {
      console.error('Failed to seal and update cookie:', error);
    }
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


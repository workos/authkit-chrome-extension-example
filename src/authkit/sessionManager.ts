import { authkit } from './authkit';

export class SessionManager {
  private refreshInterval: undefined | ReturnType<typeof setInterval>;
  // private readonly checkIntervalMs = 5 * 60 * 1000;
  private readonly checkIntervalMs = 10_000;
  private refreshBufferSeconds = 300;

  constructor() {
    this.startSessionManagement();
  }

  startSessionManagement() {
    if (this.refreshInterval) {
      return; // already running
    }

    console.log('Starting session management');
    this.refreshInterval = setInterval(() => this.checkAndRefreshSession(), this.checkIntervalMs);

    // check immediately
    this.checkAndRefreshSession();
  }

  async checkAndRefreshSession() {
    try {
      console.log('Checking session status...');
      const auth = await authkit.withAuth(void 0);

      if (!auth.user) {
        console.log('No active sesion found.');
        return;
      }

      if (auth.accessToken && auth.claims) {
        const expiryTime = auth.claims.exp;

        if (!expiryTime) {
          console.log('No expiry time found in claims.');
          return;
        }

        const currentTime = Math.floor(Date.now() / 1000);
        const timeRemaining = expiryTime - currentTime;

        if (timeRemaining <= this.refreshBufferSeconds) {
          console.log('Token expiring soon, refreshing...');
          await this.refreshSession();
        }
      }
    } catch (error) {
      console.error('Error checking session:', error);
    }
  }

  async refreshSession() {
    try {
      console.log('Refreshing session...');
      const { user, accessToken, refreshToken } = await authkit.withAuth(void 0);

      if (!user || !accessToken || !refreshToken) {
        console.log('Cannot refresh: missing user or access token');
        return;
      }

      const sessionData = {
        accessToken,
        refreshToken,
        user,
      };

      const refreshResult = await authkit.refreshSession(sessionData);
      console.log('Session refreshed successfully', refreshResult);

      await authkit.saveSession(void 0, refreshResult.sessionData);

      return refreshResult;
    } catch (error) {
      console.error('Error refreshing session:', error);
      throw error;
    }
  }

  stopSessionManagement() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = undefined;
      console.log('Session management stopped');
    }
  }
}

export const sessionManager = new SessionManager();

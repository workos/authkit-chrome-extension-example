import conf from '../../config.json';

/**
 * Service Worker compatible client for session management.
 * Since authkit-js doesn't work in service workers (no window object),
 * we need a different approach for background session management.
 */
export class ServiceWorkerAuthClient {
  private readonly baseUrl = 'https://api.workos.com';
  private readonly clientId = conf.clientId;

  /**
   * Check if there's an active session by looking for the session cookie
   */
  async hasActiveSession(): Promise<boolean> {
    try {
      const cookies = await chrome.cookies.getAll({
        url: conf.cookieDomain,
      });

      return cookies.some(cookie => cookie.name === 'workos-has-session' || cookie.name.includes('wos-session'));
    } catch (error) {
      console.error('Error checking session:', error);
      return false;
    }
  }

  /**
   * Check session validity by sending a message to popup context
   * Service workers can't properly refresh sessions - let authkit-js handle it
   */
  async refreshSession(): Promise<{ success: boolean; error?: string }> {
    try {
      const tabs = await chrome.tabs.query({ url: `${conf.cookieDomain}/*` });

      if (tabs.length > 0) {
        console.log('AuthKit website is open - session should be maintained');
        return { success: true };
      }

      console.log('No AuthKit website open - cannot refresh session');
      return { success: false, error: 'No active AuthKit website' };
    } catch (error) {
      console.error('Session refresh check error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Start periodic session refresh
   * @param intervalMs - Refresh interval in milliseconds (default: 5 minutes)
   */
  startPeriodicRefresh(intervalMs: number = 5 * 60 * 1000): () => void {
    const refreshLoop = async () => {
      if (await this.hasActiveSession()) {
        console.log('Refreshing session...');
        const result = await this.refreshSession();

        if (result.success) {
          console.log('Session kept alive');
        } else {
          console.log('Session expired');
        }
      } else {
        console.log('No active session');
      }
    };

    // Start the periodic refresh
    const intervalId = setInterval(refreshLoop, intervalMs) as unknown as number;

    // Also run once immediately
    refreshLoop();

    // Return cleanup function
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }

}

// Export singleton instance
let serviceWorkerClient: ServiceWorkerAuthClient | null = null;

export function getServiceWorkerClient(): ServiceWorkerAuthClient {
  if (!serviceWorkerClient) {
    serviceWorkerClient = new ServiceWorkerAuthClient();
  }
  return serviceWorkerClient;
}

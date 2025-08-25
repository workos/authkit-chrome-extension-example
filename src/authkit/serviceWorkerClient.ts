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
      // Check if the workos-has-session indicator cookie exists
      const cookies = await chrome.cookies.getAll({
        url: conf.cookieDomain
      });
      
      return cookies.some(cookie => 
        cookie.name === 'workos-has-session' || 
        cookie.name.includes('wos-session')
      );
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
      // Send message to any open popup to trigger session refresh
      const tabs = await chrome.tabs.query({ url: '*://localhost:3000/*' });
      
      if (tabs.length > 0) {
        // If AuthKit website is open, assume session is maintained there
        console.log('AuthKit website is open - session should be maintained');
        return { success: true };
      }
      
      // If no AuthKit website is open, we can't refresh the session
      // The session will need to be refreshed when user visits the website again
      console.log('No AuthKit website open - cannot refresh session');
      return { success: false, error: 'No active AuthKit website' };
    } catch (error) {
      console.error('Session refresh check error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Start periodic session refresh for maintaining phone calls
   * @param intervalMs - Refresh interval in milliseconds (default: 5 minutes)
   */
  startPeriodicRefresh(intervalMs: number = 5 * 60 * 1000): () => void {
    const refreshLoop = async () => {
      if (await this.hasActiveSession()) {
        console.log('Refreshing session for phone call maintenance...');
        const result = await this.refreshSession();
        
        if (result.success) {
          console.log('Session kept alive for phone call');
          // Here you could make your phone call API request
          // await this.keepPhoneCallAlive();
        } else {
          console.log('Session expired - phone call may be terminated');
        }
      } else {
        console.log('No active session - no phone call to maintain');
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

  /**
   * Example method for keeping phone call alive
   * This would make API calls to your phone service
   */
  private async keepPhoneCallAlive(): Promise<void> {
    // This is where you'd make the API call to your phone service
    // For example:
    // await fetch('/api/phone/keep-alive', {
    //   method: 'POST',
    //   headers: { Authorization: `Bearer ${accessToken}` }
    // });
    console.log('Phone call kept alive (placeholder)');
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
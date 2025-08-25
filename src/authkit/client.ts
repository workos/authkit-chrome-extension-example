import { createClient } from '@workos-inc/authkit-js';
import conf from '../../config.json';

/**
 * Check if we're running in a service worker environment
 */
function isServiceWorker(): boolean {
  return typeof window === 'undefined' && typeof self !== 'undefined';
}

/**
 * Initialize the AuthKit client for Chrome extension use.
 * Uses PKCE flow without requiring API keys.
 * Enables cookie-based session sharing with AuthKit-enabled websites.
 */
export async function createAuthkitClient() {
  // authkit-js requires window object, which isn't available in service workers
  // For service worker context, we'll return a limited client
  if (isServiceWorker()) {
    return null;
  }

  const client = await createClient(conf.clientId, {
    redirectUri: conf.redirectUri,
    apiHostname: 'api.workos.com',
    // Try devMode: true to see if this helps with session detection
    devMode: true, // This might help with cookie access in extension context
    onRefreshFailure: () => {
      console.log('AuthKit refresh failed in extension context');
    },
    onRefresh: () => {
      console.log('AuthKit session refreshed');
    },
  });

  return client;
}

// Export a singleton instance
let authkitInstance: Awaited<ReturnType<typeof createAuthkitClient>> | null = null;

export async function getAuthkitClient() {
  if (!authkitInstance) {
    authkitInstance = await createAuthkitClient();
  }
  return authkitInstance;
}

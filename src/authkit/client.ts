import { createClient } from "@workos-inc/authkit-js";
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
    console.log('Service worker detected - authkit-js not available in this context');
    return null;
  }

  console.log('Creating authkit-js client with config:', {
    clientId: conf.clientId,
    redirectUri: conf.redirectUri,
    devMode: false
  });

  const client = await createClient(conf.clientId, {
    redirectUri: conf.redirectUri,
    apiHostname: "api.workos.com",
    // Try devMode: true to see if this helps with session detection
    devMode: true, // This might help with cookie access in extension context
    // Handle refresh failures by logging them but not redirecting
    onRefreshFailure: ({ signIn }) => {
      console.log('Session refresh failed - user needs to re-authenticate on website');
      // Don't auto-redirect in extension context
    },
    // Log refresh events for debugging
    onRefresh: (response) => {
      console.log('Session refreshed successfully', { 
        user: response.user?.email,
        organizationId: response.organizationId 
      });
    }
  });

  console.log('AuthKit client created successfully');

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
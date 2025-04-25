import { type AuthKitConfig, SessionStorage, configure, createAuthKitFactory } from '@workos-inc/authkit-ssr';
import { WebSessionEncryption } from './WebSessionEncryption';
import conf from '../../config.json';

/**
 * A session storage implementation that uses Chrome's cookie storage.
 * This lets the authkit library know how to read and write the session cookie
 * using Chrome's cookie API.
 */
class ChromeExtensionStorage implements SessionStorage<void, void> {
  cookieName: string;
  domain: string;

  constructor(domain: string, cookeName = 'wos-session') {
    this.cookieName = cookeName;
    this.domain = domain;
  }

  /**
   * Get the session cookie from Chrome's cookie storage.
   * @returns The session cookie value or null if it doesn't exist.
   */
  async getSession(): Promise<string | null> {
    const cookie = await chrome.cookies.get({
      name: this.cookieName,
      url: this.domain,
    });
    return cookie?.value ?? null;
  }

  /**
   * Set the session cookie in Chrome's cookie storage.
   * @param sessionData The session data to be stored.
   * @returns A promise that resolves when the session is saved.
   */
  async saveSession(_: unknown, sessionData: string): Promise<void> {
    await chrome.cookies.set({
      name: this.cookieName,
      url: this.domain,
      value: sessionData,
      expirationDate: Date.now() / 1000 + 60 * 60 * 24 * 400, // 400 days
    });
  }

  /**
   * Remove the session cookie from Chrome's cookie storage.
   * @returns A promise that resolves when the session is cleared.
   */
  async clearSession(): Promise<void> {
    console.log('%cclearSession called.', 'color: red; font-weight: bold;');
    await chrome.cookies.remove({
      name: this.cookieName,
      url: this.domain,
    });
  }
}

const config = {
  cookieDomain: 'http://localhost:3000',
  redirectUri: 'http://localhost:3000/callback',
  ...conf,
} satisfies Partial<AuthKitConfig>;

// Configure the authkit library with the provided configuration.
configure(config);

export const authkit = createAuthKitFactory<void, void>({
  // use  iron-session campatible encryption that works in the browser / extension environment
  sessionEncryptionFactory: () => new WebSessionEncryption(),
  sessionStorageFactory: config => new ChromeExtensionStorage(config.cookieDomain!, config.cookieName),
});

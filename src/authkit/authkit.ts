import { type AuthKitConfig, SessionStorage, configure, createAuthKitFactory } from '@workos-inc/authkit-ssr';
import { WebSessionEncryption } from './WebSessionEncryption';
import conf from '../../config.json';

class ChromeExtensionStorage implements SessionStorage<void, void> {
  cookieName: string;
  domain: string;

  constructor(domain: string, cookeName = 'wos-session') {
    this.cookieName = cookeName;
    this.domain = domain;
  }

  async getSession(): Promise<string | null> {
    const cookie = await chrome.cookies.get({
      name: this.cookieName,
      url: this.domain,
    });
    return cookie?.value ?? null;
  }

  async saveSession(_: unknown, sessionData: string): Promise<void> {
    await chrome.cookies.set({
      name: this.cookieName,
      url: this.domain,
      value: sessionData,
      expirationDate: Date.now() / 1000 + 60 * 60 * 24 * 400, // 400 days
    });
  }

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

configure(config);

export const authkit = createAuthKitFactory<void, void>({
  sessionEncryptionFactory: () => new WebSessionEncryption(),
  sessionStorageFactory: config => new ChromeExtensionStorage(config.cookieDomain!, config.cookieName),
});

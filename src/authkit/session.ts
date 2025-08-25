import conf from '../../config.json';

interface SealedSession {
  encrypted: string;
  iv: string;
  salt: string;
}

export interface SessionData {
  user?: {
    object?: string;
    id?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    emailVerified?: boolean;
    profilePictureUrl?: string | null;
    lastSignInAt?: string | null;
    createdAt?: string;
    updatedAt?: string;
    externalId?: string | null;
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
  } | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  impersonator?: unknown | null;
  sessionId?: string | null;
  claims?: Record<string, unknown> | null;
  source?: 'localStorage' | 'cookie';
  originalFormat?: string;
  cookieName?: string;
  originalCookieValue?: string;
  sessionDetected?: boolean;
  error?: string;
  [key: string]: unknown;
}

/**
 * Convert base64url to Uint8Array
 */
function base64urlToBytes(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4);
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

/**
 * Convert Uint8Array to base64url
 */
function bytesToBase64url(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode.apply(null, Array.from(bytes)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Legacy encrypted session format (reverse engineered from source)
 */
async function unsealLegacyFormat(sealedData: string): Promise<SessionData> {
  // Step 1: Parse version delimiter (iron-session adds ~2)
  const versionDelimiter = '~';
  let sealWithoutVersion = sealedData;
  let tokenVersion = null;

  if (sealedData.includes(versionDelimiter)) {
    const [seal, versionStr] = sealedData.split(versionDelimiter);
    sealWithoutVersion = seal;
    tokenVersion = versionStr ? parseInt(versionStr, 10) : null;
  }

  // Step 2: Parse legacy format - Fe26.2*version*mac*iv*encrypted*expiration*hmacSalt*hmacIv
  const parts = sealWithoutVersion.split('*');

  if (parts.length < 6 || !parts[0].startsWith('Fe26.2')) {
    throw new Error('Invalid legacy sealed data format');
  }

  const [, , encryptionSalt, encryptionIv, encryptedB64] = parts;

  try {
    const encryptedBuffer = base64urlToBytes(encryptedB64);
    const ivBuffer = base64urlToBytes(encryptionIv);

    const password = conf.cookiePassword;
    const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
      'deriveBits',
    ]);

    const derivedKeyBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: new TextEncoder().encode(encryptionSalt),
        iterations: 1,
        hash: 'SHA-1',
      },
      keyMaterial,
      256,
    );
    const encryptionKey = await crypto.subtle.importKey('raw', derivedKeyBits, { name: 'AES-CBC' }, false, ['decrypt']);

    // Step 5: Decrypt using AES-256-CBC
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-CBC',
        iv: ivBuffer,
      },
      encryptionKey,
      encryptedBuffer,
    );

    // Step 6: Parse JSON data
    const decryptedText = new TextDecoder().decode(decryptedBuffer);
    const sessionData = JSON.parse(decryptedText);

    // Step 7: Handle version-specific extraction (from iron-session)
    if (tokenVersion === 2) {
      return sessionData;
    } else if (tokenVersion !== null && tokenVersion !== 2) {
      return { ...sessionData.persistent };
    }

    // No version info - return as-is
    return sessionData;
  } catch (error) {
    console.error('Error with legacy session algorithm:', error);
    throw error;
  }
}

/**
 * Unseal a WorkOS session cookie using vanilla Web Crypto API
 */
export async function unsealSession(sealedData: string): Promise<SessionData> {
  // Check if this is a legacy sealed session
  if (sealedData.startsWith('Fe26.2')) {
    return await unsealLegacyFormat(sealedData);
  }

  // Try different cookie formats (original logic for other formats)
  let decoded: SealedSession;

  // First, try direct JSON parsing (maybe it's not base64 encoded)
  try {
    decoded = JSON.parse(sealedData) as SealedSession;
  } catch {
    // Try base64 decoding
    try {
      decoded = JSON.parse(atob(sealedData)) as SealedSession;
    } catch {
      // Try URL-safe base64 (replace - with + and _ with /)
      const urlSafeFixed = sealedData.replace(/-/g, '+').replace(/_/g, '/');
      // Add padding if needed
      const padded = urlSafeFixed + '='.repeat((4 - (urlSafeFixed.length % 4)) % 4);

      try {
        decoded = JSON.parse(atob(padded)) as SealedSession;
      } catch {
        throw new Error('Cookie format not recognized');
      }
    }
  }

  // Check if we have the expected fields for a sealed session
  if (!decoded.encrypted || !decoded.iv || !decoded.salt) {
    throw new Error('Cookie does not contain sealed session data');
  }

  // Convert base64 strings to ArrayBuffers
  const encrypted = Uint8Array.from(atob(decoded.encrypted), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(decoded.iv), c => c.charCodeAt(0));
  const salt = Uint8Array.from(atob(decoded.salt), c => c.charCodeAt(0));

  // Derive key from password using PBKDF2
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(conf.cookiePassword),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );

  // Decrypt the data
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, derivedKey, encrypted);

  // Convert decrypted data back to string and parse JSON
  const sessionData = JSON.parse(new TextDecoder().decode(decrypted));

  return sessionData;
}

/**
 * Seal session data back into encrypted cookie format
 */
export async function sealSession(sessionData: SessionData): Promise<string> {
  try {
    // Always use iron-session compatible format
    return await sealLegacyFormat(sessionData);
  } catch (error) {
    console.error('Error sealing session:', error);
    throw error;
  }
}

/**
 * Seal session data using legacy format (Fe26.2) - iron-session compatible
 */
async function sealLegacyFormat(sessionData: SessionData): Promise<string> {
  const password = conf.cookiePassword;
  const jsonString = JSON.stringify(sessionData);

  // Generate random 32-byte salts (matching iron-session)
  const encryptionSalt = crypto.getRandomValues(new Uint8Array(32));
  const hmacSalt = crypto.getRandomValues(new Uint8Array(32));
  const encryptionIv = crypto.getRandomValues(new Uint8Array(16));

  // Convert salts to hex (iron-session format)
  const encryptionSaltHex = Array.from(encryptionSalt)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  const hmacSaltHex = Array.from(hmacSalt)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Derive encryption key using PBKDF2 (iron-session parameters)
  const encryptionKeyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const encryptionKeyBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode(encryptionSaltHex),
      iterations: 1,
      hash: 'SHA-1',
    },
    encryptionKeyMaterial,
    256,
  );

  const encryptionKey = await crypto.subtle.importKey('raw', encryptionKeyBits, { name: 'AES-CBC' }, false, [
    'encrypt',
  ]);

  // Encrypt the JSON string
  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-CBC',
      iv: encryptionIv,
    },
    encryptionKey,
    new TextEncoder().encode(jsonString),
  );

  // Convert to base64url (iron-session format)
  const encryptedB64 = bytesToBase64url(new Uint8Array(encryptedBuffer));
  const encryptionIvB64 = bytesToBase64url(encryptionIv);

  // Create the unsigned data for HMAC - USE MILLISECONDS like iron-session!
  const expiration = Date.now() + 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  const unsignedData = `Fe26.2*1*${encryptionSaltHex}*${encryptionIvB64}*${encryptedB64}*${expiration}`;

  // Derive HMAC key
  const hmacKeyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);

  const hmacKeyBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode(hmacSaltHex),
      iterations: 1,
      hash: 'SHA-1',
    },
    hmacKeyMaterial,
    256,
  );

  const hmacKey = await crypto.subtle.importKey('raw', hmacKeyBits, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

  // Calculate HMAC signature
  const signature = await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(unsignedData));

  const signatureB64 = bytesToBase64url(new Uint8Array(signature));

  // Build iron-session format string (8 parts total, signature as part 7)
  // Format: Fe26.2*passwordId*encryptionSalt*encryptionIv*encrypted*expiration*hmacSalt*signature
  const sealed = `Fe26.2*1*${encryptionSaltHex}*${encryptionIvB64}*${encryptedB64}*${expiration}*${hmacSaltHex}*${signatureB64}`;

  // Add version suffix for compatibility
  return `${sealed}~2`;
}

/**
 * Check localStorage for AuthKit React devMode=true sessions
 */
async function checkLocalStorageSession(): Promise<SessionData | null> {
  try {
    // Get all tabs that match our domain
    const tabs = await chrome.tabs.query({
      url: conf.cookieDomain + '/*',
    });

    if (tabs.length === 0) {
      return null;
    }

    // Execute script in the first matching tab to check localStorage
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id! },
      func: () => {
        // Check for AuthKit localStorage keys - try both formats
        const refreshToken =
          localStorage.getItem('workos:refresh-token') || localStorage.getItem('workos.refresh_token');
        const accessToken = localStorage.getItem('workos:access-token') || localStorage.getItem('workos.access_token');
        const userString = localStorage.getItem('workos:user') || localStorage.getItem('workos.user');
        const impersonatorString =
          localStorage.getItem('workos:impersonator') || localStorage.getItem('workos.impersonator');

        // If we have at least a refresh token, we can work with that
        if (!refreshToken && !accessToken && !userString) {
          return null;
        }

        let user = null;
        let impersonator = null;

        try {
          if (userString) {
            user = JSON.parse(userString);
          }
        } catch {
          // Silently ignore parse errors
        }

        try {
          if (impersonatorString) {
            impersonator = JSON.parse(impersonatorString);
          }
        } catch {
          // Silently ignore parse errors
        }

        return {
          user,
          accessToken,
          refreshToken,
          impersonator,
          sessionId: null,
          claims: null,
          source: 'localStorage' as const,
        };
      },
    });

    return result?.result || null;
  } catch (error) {
    console.warn('Failed to check localStorage for session:', error);
    return null;
  }
}

/**
 * Try different cookie name patterns and unseal if found
 */
export async function findAndUnsealSession(): Promise<SessionData | null> {
  // First, try to get session from localStorage (AuthKit React devMode=true)
  const localStorageSession = await checkLocalStorageSession();
  if (localStorageSession) {
    return localStorageSession;
  }

  // Fallback to cookie-based session detection
  const cookies = await chrome.cookies.getAll({
    url: conf.cookieDomain,
  });

  const sessionCookie = cookies.find(
    c => c.name.includes('wos-session') || c.name.includes('workos') || c.name === 'authkit-session',
  );

  if (!sessionCookie) {
    return null;
  }

  try {
    // Determine session format for later sealing
    let originalFormat = 'unknown';
    const originalCookieValue = sessionCookie.value;

    if (sessionCookie.value.startsWith('Fe26.2')) {
      originalFormat = 'legacy';
    } else if (sessionCookie.value.includes('.')) {
      // JWT or similar format - try parsing
      const parts = sessionCookie.value.split('.');
      if (parts.length >= 2) {
        // Try to decode the payload part (usually the second part in a JWT)
        for (let i = 0; i < parts.length; i++) {
          try {
            const part = parts[i];
            // Fix base64 padding
            const padded = part + '='.repeat((4 - (part.length % 4)) % 4);
            const decoded = JSON.parse(atob(padded.replace(/-/g, '+').replace(/_/g, '/')));

            if (decoded && (decoded.user || decoded.email || decoded.id)) {
              return {
                ...decoded,
                originalFormat: 'jwt',
                cookieName: sessionCookie.name,
                originalCookieValue,
                source: 'cookie' as const,
              };
            }
          } catch {
            // Continue trying other parts
          }
        }
      }
      originalFormat = 'jwt';
    } else {
      // Try to detect if it's base64 JSON or encrypted
      try {
        JSON.parse(sessionCookie.value);
        originalFormat = 'json';
      } catch {
        try {
          JSON.parse(atob(sessionCookie.value));
          originalFormat = 'standard';
        } catch {
          originalFormat = 'standard'; // Assume encrypted
        }
      }
    }

    const sessionData = await unsealSession(sessionCookie.value);

    // Add metadata for sealing
    return {
      ...sessionData,
      originalFormat,
      cookieName: sessionCookie.name,
      originalCookieValue,
      source: 'cookie' as const,
    };
  } catch (error) {
    return {
      sessionDetected: true,
      cookieName: sessionCookie.name,
      originalFormat: 'unknown',
      originalCookieValue: sessionCookie.value,
      source: 'cookie' as const,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

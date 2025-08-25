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
 * Base64url encoding/decoding utilities
 */
function base64urlToBytes(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4);
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64url(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode.apply(null, Array.from(bytes)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Cryptographic utilities
 */
interface DerivedKeyOptions {
  password: string;
  salt: string | Uint8Array;
  iterations: number;
  hashAlgorithm: string;
  keyLength: number;
}

async function deriveKeyBits(options: DerivedKeyOptions): Promise<ArrayBuffer> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(options.password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const saltBytes = typeof options.salt === 'string' ? new TextEncoder().encode(options.salt) : options.salt;

  return crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes as BufferSource,
      iterations: options.iterations,
      hash: options.hashAlgorithm,
    },
    keyMaterial,
    options.keyLength,
  );
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateRandomBytes(length: number): Uint8Array {
  const buffer = new Uint8Array(length);
  return crypto.getRandomValues(buffer);
}

/**
 * Session data parsing utilities
 */
function tryParseSessionData(sealedData: string): SealedSession {
  // First, try direct JSON parsing (maybe it's not base64 encoded)
  try {
    return JSON.parse(sealedData) as SealedSession;
  } catch {
    // Try base64 decoding
    try {
      return JSON.parse(atob(sealedData)) as SealedSession;
    } catch {
      // Try URL-safe base64 (replace - with + and _ with /)
      const urlSafeFixed = sealedData.replace(/-/g, '+').replace(/_/g, '/');
      // Add padding if needed
      const padded = urlSafeFixed + '='.repeat((4 - (urlSafeFixed.length % 4)) % 4);

      try {
        return JSON.parse(atob(padded)) as SealedSession;
      } catch {
        throw new Error('Cookie format not recognized');
      }
    }
  }
}

function parseVersionFromSeal(sealedData: string): { sealWithoutVersion: string; tokenVersion: number | null } {
  const versionDelimiter = '~';
  let sealWithoutVersion = sealedData;
  let tokenVersion = null;

  if (sealedData.includes(versionDelimiter)) {
    const [seal, versionStr] = sealedData.split(versionDelimiter);
    sealWithoutVersion = seal;
    tokenVersion = versionStr ? parseInt(versionStr, 10) : null;
  }

  return { sealWithoutVersion, tokenVersion };
}

function parseLegacyFormat(sealWithoutVersion: string): {
  encryptionSalt: string;
  encryptionIv: string;
  encryptedB64: string;
} {
  // Parse legacy format - Fe26.2*version*mac*iv*encrypted*expiration*hmacSalt*hmacIv
  const parts = sealWithoutVersion.split('*');

  if (parts.length < 6 || !parts[0].startsWith('Fe26.2')) {
    throw new Error('Invalid legacy sealed data format');
  }

  const [, , encryptionSalt, encryptionIv, encryptedB64] = parts;
  return { encryptionSalt, encryptionIv, encryptedB64 };
}

async function decryptLegacyData(encryptedB64: string, encryptionIv: string, encryptionSalt: string): Promise<string> {
  const encryptedBuffer = base64urlToBytes(encryptedB64);
  const ivBuffer = base64urlToBytes(encryptionIv);

  // Derive decryption key using iron-session parameters
  const keyBits = await deriveKeyBits({
    password: conf.cookiePassword,
    salt: encryptionSalt,
    iterations: 1,
    hashAlgorithm: 'SHA-1',
    keyLength: 256,
  });

  const encryptionKey = await crypto.subtle.importKey('raw', keyBits, { name: 'AES-CBC' }, false, ['decrypt']);

  // Decrypt using AES-256-CBC
  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-CBC',
      iv: ivBuffer as BufferSource,
    },
    encryptionKey,
    encryptedBuffer as BufferSource,
  );

  return new TextDecoder().decode(decryptedBuffer);
}

function extractSessionFromDecryptedData(decryptedText: string, tokenVersion: number | null): SessionData {
  const sessionData = JSON.parse(decryptedText);

  // Handle version-specific extraction (from iron-session)
  if (tokenVersion === 2) {
    return sessionData;
  } else if (tokenVersion !== null && tokenVersion !== 2) {
    return { ...sessionData.persistent };
  }

  // No version info - return as-is
  return sessionData;
}

/**
 * Legacy encrypted session format (reverse engineered from source)
 */
async function unsealLegacyFormat(sealedData: string): Promise<SessionData> {
  // Step 1: Parse version delimiter (iron-session adds ~2)
  const { sealWithoutVersion, tokenVersion } = parseVersionFromSeal(sealedData);

  try {
    // Step 2: Parse legacy format structure
    const { encryptionSalt, encryptionIv, encryptedB64 } = parseLegacyFormat(sealWithoutVersion);

    // Step 3: Decrypt the data
    const decryptedText = await decryptLegacyData(encryptedB64, encryptionIv, encryptionSalt);

    // Step 4: Extract session data based on version
    return extractSessionFromDecryptedData(decryptedText, tokenVersion);
  } catch (error) {
    console.error('Error with legacy session algorithm:', error);
    throw error;
  }
}

/**
 * Standard encrypted session format utilities
 */
async function unsealStandardFormat(decoded: SealedSession): Promise<SessionData> {
  // Check if we have the expected fields for a sealed session
  if (!decoded.encrypted || !decoded.iv || !decoded.salt) {
    throw new Error('Cookie does not contain sealed session data');
  }

  // Convert base64 strings to ArrayBuffers
  const encrypted = base64ToBytes(decoded.encrypted);
  const iv = base64ToBytes(decoded.iv);
  const salt = base64ToBytes(decoded.salt);

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
      salt: salt as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );

  // Decrypt the data
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, derivedKey, encrypted as BufferSource);

  // Convert decrypted data back to string and parse JSON
  return JSON.parse(new TextDecoder().decode(decrypted));
}

/**
 * Unseal a WorkOS session cookie using vanilla Web Crypto API
 */
export async function unsealSession(sealedData: string): Promise<SessionData> {
  // Check if this is a legacy sealed session
  if (sealedData.startsWith('Fe26.2')) {
    return unsealLegacyFormat(sealedData);
  }

  // Try to parse as standard encrypted format
  const decoded = tryParseSessionData(sealedData);
  return unsealStandardFormat(decoded);
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
 * Legacy format sealing utilities
 */
interface EncryptionComponents {
  encryptionSalt: Uint8Array;
  hmacSalt: Uint8Array;
  encryptionIv: Uint8Array;
  encryptionSaltHex: string;
  hmacSaltHex: string;
}

function generateEncryptionComponents(): EncryptionComponents {
  // Generate random 32-byte salts (matching iron-session)
  const encryptionSalt = generateRandomBytes(32);
  const hmacSalt = generateRandomBytes(32);
  const encryptionIv = generateRandomBytes(16);

  // Convert salts to hex (iron-session format)
  const encryptionSaltHex = bytesToHex(encryptionSalt);
  const hmacSaltHex = bytesToHex(hmacSalt);

  return {
    encryptionSalt,
    hmacSalt,
    encryptionIv,
    encryptionSaltHex,
    hmacSaltHex,
  };
}

async function encryptSessionData(
  jsonString: string,
  components: EncryptionComponents,
): Promise<{ encryptedB64: string; encryptionIvB64: string }> {
  // Derive encryption key using PBKDF2 (iron-session parameters)
  const encryptionKeyBits = await deriveKeyBits({
    password: conf.cookiePassword,
    salt: components.encryptionSaltHex,
    iterations: 1,
    hashAlgorithm: 'SHA-1',
    keyLength: 256,
  });

  const encryptionKey = await crypto.subtle.importKey('raw', encryptionKeyBits, { name: 'AES-CBC' }, false, [
    'encrypt',
  ]);

  // Encrypt the JSON string
  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-CBC',
      iv: components.encryptionIv as BufferSource,
    },
    encryptionKey,
    new TextEncoder().encode(jsonString),
  );

  // Convert to base64url (iron-session format)
  const encryptedB64 = bytesToBase64url(new Uint8Array(encryptedBuffer));
  const encryptionIvB64 = bytesToBase64url(components.encryptionIv);

  return { encryptedB64, encryptionIvB64 };
}

async function signSealedData(
  encryptionSaltHex: string,
  encryptionIvB64: string,
  encryptedB64: string,
  hmacSaltHex: string,
): Promise<{ signatureB64: string; expiration: number }> {
  // Create the unsigned data for HMAC - USE MILLISECONDS like iron-session!
  const expiration = Date.now() + 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  const unsignedData = `Fe26.2*1*${encryptionSaltHex}*${encryptionIvB64}*${encryptedB64}*${expiration}`;

  // Derive HMAC key
  const hmacKeyBits = await deriveKeyBits({
    password: conf.cookiePassword,
    salt: hmacSaltHex,
    iterations: 1,
    hashAlgorithm: 'SHA-1',
    keyLength: 256,
  });

  const hmacKey = await crypto.subtle.importKey('raw', hmacKeyBits, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

  // Calculate HMAC signature
  const signature = await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(unsignedData));
  const signatureB64 = bytesToBase64url(new Uint8Array(signature));

  return { signatureB64, expiration };
}

/**
 * Seal session data using legacy format (Fe26.2) - iron-session compatible
 */
async function sealLegacyFormat(sessionData: SessionData): Promise<string> {
  const jsonString = JSON.stringify(sessionData);

  // Step 1: Generate encryption components
  const components = generateEncryptionComponents();

  // Step 2: Encrypt the session data
  const { encryptedB64, encryptionIvB64 } = await encryptSessionData(jsonString, components);

  // Step 3: Sign the sealed data
  const { signatureB64, expiration } = await signSealedData(
    components.encryptionSaltHex,
    encryptionIvB64,
    encryptedB64,
    components.hmacSaltHex,
  );

  // Build iron-session format string (8 parts total, signature as part 7)
  // Format: Fe26.2*passwordId*encryptionSalt*encryptionIv*encrypted*expiration*hmacSalt*signature
  const sealed = `Fe26.2*1*${components.encryptionSaltHex}*${encryptionIvB64}*${encryptedB64}*${expiration}*${components.hmacSaltHex}*${signatureB64}`;

  // Add version suffix for compatibility
  return `${sealed}~2`;
}

/**
 * LocalStorage session utilities
 */
function parseLocalStorageValue(value: string | null): any | null {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractLocalStorageSession(): SessionData | null {
  // Check for AuthKit localStorage keys - try both formats
  const refreshToken = localStorage.getItem('workos:refresh-token') || localStorage.getItem('workos.refresh_token');
  const accessToken = localStorage.getItem('workos:access-token') || localStorage.getItem('workos.access_token');
  const userString = localStorage.getItem('workos:user') || localStorage.getItem('workos.user');
  const impersonatorString = localStorage.getItem('workos:impersonator') || localStorage.getItem('workos.impersonator');

  // If we have no session data, return null
  if (!refreshToken && !accessToken && !userString) {
    return null;
  }

  const user = parseLocalStorageValue(userString);
  const impersonator = parseLocalStorageValue(impersonatorString);

  return {
    user,
    accessToken,
    refreshToken,
    impersonator,
    sessionId: null,
    claims: null,
    source: 'localStorage' as const,
  };
}

/**
 * Check localStorage for AuthKit React devMode=true sessions
 */
async function checkLocalStorageSession(): Promise<SessionData | null> {
  try {
    // Get all tabs that match our domain
    const matchingTabs = await chrome.tabs.query({
      url: conf.cookieDomain + '/*',
    });

    if (matchingTabs.length === 0) {
      return null;
    }

    // Execute script in the first matching tab to check localStorage
    const firstTab = matchingTabs[0];
    const [scriptResult] = await chrome.scripting.executeScript({
      target: { tabId: firstTab.id! },
      func: extractLocalStorageSession,
    });

    return scriptResult?.result || null;
  } catch (error) {
    console.warn('Failed to check localStorage for session:', error);
    return null;
  }
}

/**
 * Cookie detection and parsing utilities
 */
function findSessionCookie(cookies: chrome.cookies.Cookie[]): chrome.cookies.Cookie | null {
  return (
    cookies.find(c => c.name.includes('wos-session') || c.name.includes('workos') || c.name === 'authkit-session') ||
    null
  );
}

function tryParseJwtPart(part: string): unknown | null {
  try {
    // Fix base64 padding
    const padded = part + '='.repeat((4 - (part.length % 4)) % 4);
    const decoded = JSON.parse(atob(padded.replace(/-/g, '+').replace(/_/g, '/')));

    if (decoded && (decoded.user || decoded.email || decoded.id)) {
      return decoded;
    }
  } catch {
    // Ignore parsing errors
  }
  return null;
}

function tryParseJwtCookie(cookieValue: string): SessionData | null {
  if (!cookieValue.includes('.')) {
    return null;
  }

  const parts = cookieValue.split('.');
  if (parts.length < 2) {
    return null;
  }

  // Try to decode the payload part (usually the second part in a JWT)
  for (let i = 0; i < parts.length; i++) {
    const decoded = tryParseJwtPart(parts[i]);
    if (decoded) {
      return decoded as SessionData;
    }
  }

  return null;
}

function detectCookieFormat(cookieValue: string): string {
  if (cookieValue.startsWith('Fe26.2')) {
    return 'legacy';
  }

  if (cookieValue.includes('.')) {
    return 'jwt';
  }

  // Try to detect if it's base64 JSON or encrypted
  try {
    JSON.parse(cookieValue);
    return 'json';
  } catch {
    try {
      JSON.parse(atob(cookieValue));
      return 'standard';
    } catch {
      return 'standard'; // Assume encrypted
    }
  }
}

function createSessionMetadata(
  sessionData: SessionData,
  originalFormat: string,
  cookieName: string,
  originalCookieValue: string,
): SessionData {
  return {
    ...sessionData,
    originalFormat,
    cookieName,
    originalCookieValue,
    source: 'cookie' as const,
  };
}

function createErrorSession(cookieName: string, originalCookieValue: string, error: unknown): SessionData {
  return {
    sessionDetected: true,
    cookieName,
    originalFormat: 'unknown',
    originalCookieValue,
    source: 'cookie' as const,
    error: error instanceof Error ? error.message : String(error),
  };
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
  const cookies = await chrome.cookies.getAll({ url: conf.cookieDomain });
  const sessionCookie = findSessionCookie(cookies);

  if (!sessionCookie) {
    return null;
  }

  try {
    const cookieValue = sessionCookie.value;
    const originalFormat = detectCookieFormat(cookieValue);

    // Special handling for JWT format
    if (originalFormat === 'jwt') {
      const jwtSession = tryParseJwtCookie(cookieValue);
      if (jwtSession) {
        return createSessionMetadata(jwtSession, 'jwt', sessionCookie.name, cookieValue);
      }
    }

    // Try to unseal the session data
    const sessionData = await unsealSession(cookieValue);
    return createSessionMetadata(sessionData, originalFormat, sessionCookie.name, cookieValue);
  } catch (error) {
    return createErrorSession(sessionCookie.name, sessionCookie.value, error);
  }
}

import conf from '../../config.json';

interface SealedSession {
  encrypted: string;
  iv: string;
  salt: string;
}

/**
 * Generate Iron-specific key using exact Iron algorithm
 */
async function generateIronKey(password: string, salt: string, algorithm: string, iterations: number = 1000): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  
  // Iron constructs salt as: algorithm + "**" + salt + "**" + usage
  const fullSalt = encoder.encode(algorithm + '**' + salt + '**' + 'encryption');
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: fullSalt,
      iterations: iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-CBC', length: 256 },
    false,
    ['decrypt']
  );
}

/**
 * Convert base64url to Uint8Array
 */
function base64urlToBytes(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - base64url.length % 4) % 4);
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

/**
 * Generate authkit-session compatible encryption key
 */
async function generateAuthkitSessionKey(password: string, salt: Uint8Array, iterations: number = 1): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-CBC', length: 256 },
    false,
    ['decrypt']
  );
}

/**
 * Exact iron-webcrypto algorithm (reverse engineered from source)
 */
async function unsealIronSession(sealedData: string): Promise<any> {
  
  // Step 1: Parse version delimiter (iron-session adds ~2)
  const versionDelimiter = '~';
  let sealWithoutVersion = sealedData;
  let tokenVersion = null;
  
  if (sealedData.includes(versionDelimiter)) {
    const [seal, versionStr] = sealedData.split(versionDelimiter);
    sealWithoutVersion = seal;
    tokenVersion = versionStr ? parseInt(versionStr, 10) : null;
  }
  
  // Step 2: Parse Iron format - Fe26.2*version*mac*iv*encrypted*expiration*hmacSalt*hmacIv
  const parts = sealWithoutVersion.split('*');
  
  if (parts.length < 6 || !parts[0].startsWith('Fe26.2')) {
    throw new Error('Invalid Iron sealed data format');
  }
  
  const [prefix, passwordId, encryptionSalt, encryptionIv, encryptedB64, expiration, hmacSalt, hmacIv] = parts;
  
  try {
    const encryptedBuffer = base64urlToBytes(encryptedB64);
    const ivBuffer = base64urlToBytes(encryptionIv);
    
    const password = conf.cookiePassword;
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    
    const derivedKeyBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: new TextEncoder().encode(encryptionSalt),
        iterations: 1,
        hash: 'SHA-1'
      },
      keyMaterial,
      256
    );
    const encryptionKey = await crypto.subtle.importKey(
      'raw',
      derivedKeyBits,
      { name: 'AES-CBC' },
      false,
      ['decrypt']
    );
    
    // Step 5: Decrypt using AES-256-CBC
    const decryptedBuffer = await crypto.subtle.decrypt(
      { 
        name: 'AES-CBC', 
        iv: ivBuffer 
      },
      encryptionKey,
      encryptedBuffer
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
    console.error('Error with iron-webcrypto algorithm:', error);
    throw error;
  }
}

/**
 * Unseal a WorkOS session cookie using vanilla Web Crypto API
 */
export async function unsealSession(sealedData: string): Promise<any> {
  try {
    // Check if this is an Iron sealed session
    if (sealedData.startsWith('Fe26.2')) {
      return await unsealIronSession(sealedData);
    }
    
    // Try different cookie formats (original logic for other formats)
    let decoded: SealedSession;
    
    // First, try direct JSON parsing (maybe it's not base64 encoded)
    try {
      decoded = JSON.parse(sealedData) as SealedSession;
    } catch (directJsonError) {
      
      // Try base64 decoding
      try {
        decoded = JSON.parse(atob(sealedData)) as SealedSession;
      } catch (base64Error) {
        
        // Try URL-safe base64 (replace - with + and _ with /)
        const urlSafeFixed = sealedData.replace(/-/g, '+').replace(/_/g, '/');
        // Add padding if needed
        const padded = urlSafeFixed + '='.repeat((4 - urlSafeFixed.length % 4) % 4);
        
        try {
          decoded = JSON.parse(atob(padded)) as SealedSession;
        } catch (urlSafeError) {
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
      ['deriveKey']
    );
    
    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      passwordKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    
    // Decrypt the data
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      derivedKey,
      encrypted
    );
    
    // Convert decrypted data back to string and parse JSON
    const sessionData = JSON.parse(new TextDecoder().decode(decrypted));
    
    return sessionData;
  } catch (error) {
    throw error;
  }
}

/**
 * Check localStorage for AuthKit React devMode=true sessions
 */
async function checkLocalStorageSession(): Promise<any> {
  try {
    // Get all tabs that match our domain
    const tabs = await chrome.tabs.query({
      url: conf.cookieDomain + "/*"
    });
    
    if (tabs.length === 0) {
      return null;
    }
    
    // Execute script in the first matching tab to check localStorage
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id! },
      func: () => {
        // Check for AuthKit localStorage keys - try both formats
        const refreshToken = localStorage.getItem('workos:refresh-token') || localStorage.getItem('workos.refresh_token');
        const accessToken = localStorage.getItem('workos:access-token') || localStorage.getItem('workos.access_token');
        const userString = localStorage.getItem('workos:user') || localStorage.getItem('workos.user');
        const impersonatorString = localStorage.getItem('workos:impersonator') || localStorage.getItem('workos.impersonator');
        
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
        } catch (e) {
          // Silently ignore parse errors
        }
        
        try {
          if (impersonatorString) {
            impersonator = JSON.parse(impersonatorString);
          }
        } catch (e) {
          // Silently ignore parse errors
        }
        
        return {
          user,
          accessToken,
          refreshToken,
          impersonator,
          sessionId: null,
          claims: null,
          source: 'localStorage'
        };
      }
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
export async function findAndUnsealSession(): Promise<any> {
  // First, try to get session from localStorage (AuthKit React devMode=true)
  const localStorageSession = await checkLocalStorageSession();
  if (localStorageSession) {
    return localStorageSession;
  }
  
  // Fallback to cookie-based session detection
  const cookies = await chrome.cookies.getAll({
    url: conf.cookieDomain
  });
  
  const sessionCookie = cookies.find(c => 
    c.name.includes('wos-session') || 
    c.name.includes('workos') ||
    c.name === 'authkit-session'
  );
  
  if (!sessionCookie) {
    return null;
  }
  
  try {
    if (sessionCookie.value.includes('.')) {
      const parts = sessionCookie.value.split('.');
      if (parts.length >= 2) {
        // Try to decode the payload part (usually the second part in a JWT)
        for (let i = 0; i < parts.length; i++) {
          try {
            const part = parts[i];
            // Fix base64 padding
            const padded = part + '='.repeat((4 - part.length % 4) % 4);
            const decoded = JSON.parse(atob(padded.replace(/-/g, '+').replace(/_/g, '/')));
            
            if (decoded && (decoded.user || decoded.email || decoded.id)) {
              return decoded;
            }
          } catch (partError) {
            // Continue trying other parts
          }
        }
      }
    }
    
    const sessionData = await unsealSession(sessionCookie.value);
    return sessionData;
  } catch (error) {
    return {
      sessionDetected: true,
      cookieName: sessionCookie.name,
      error: error.message
    };
  }
}
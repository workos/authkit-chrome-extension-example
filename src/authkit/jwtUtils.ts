/**
 * JWT parsing utilities for token expiry and claims extraction
 */

interface JwtClaims {
  exp?: number;
  iat?: number;
  sub?: string;
  org_id?: string;
  sid?: string;
  role?: string;
  permissions?: string[];
  [key: string]: any;
}

/**
 * Parse JWT token to extract claims without verification
 * @param token JWT token string
 * @returns Parsed claims object or null if invalid
 */
export function parseJwtClaims(token: string): JwtClaims | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const payload = parts[1];
    // Add padding if needed for base64 decoding
    const paddedPayload = payload + '='.repeat((4 - payload.length % 4) % 4);
    
    const decoded = atob(paddedPayload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  } catch (error) {
    console.warn('Failed to parse JWT token:', error);
    return null;
  }
}

/**
 * Get expiry time from JWT token
 * @param token JWT token string
 * @returns Expiry time in milliseconds, or null if not available
 */
export function getTokenExpiry(token: string): number | null {
  const claims = parseJwtClaims(token);
  if (!claims || !claims.exp) {
    return null;
  }
  
  // Convert from seconds to milliseconds
  return claims.exp * 1000;
}

/**
 * Check if token is expired or will expire within buffer time
 * @param token JWT token string
 * @param bufferSeconds Number of seconds before expiry to consider "expiring"
 * @returns True if token is expired or expiring soon
 */
export function isTokenExpiring(token: string, bufferSeconds: number = 300): boolean {
  const expiryTime = getTokenExpiry(token);
  if (!expiryTime) {
    // If we can't parse expiry, assume it's expiring to be safe
    return true;
  }
  
  const currentTime = Date.now();
  const bufferTime = bufferSeconds * 1000;
  
  return (expiryTime - currentTime) <= bufferTime;
}

/**
 * Get time remaining until token expiry
 * @param token JWT token string
 * @returns Time remaining in milliseconds, or null if not available
 */
export function getTimeUntilExpiry(token: string): number | null {
  const expiryTime = getTokenExpiry(token);
  if (!expiryTime) {
    return null;
  }
  
  return Math.max(0, expiryTime - Date.now());
}
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock chrome APIs
const mockChrome = {
  tabs: {
    query: vi.fn()
  },
  scripting: {
    executeScript: vi.fn()
  },
  cookies: {
    set: vi.fn()
  }
}

// Mock fetch
global.fetch = vi.fn()
global.chrome = mockChrome as any

// Mock authkit
vi.mock('./authkit', () => ({
  authkit: {
    checkStorageBasedSession: vi.fn()
  }
}))

// Mock sealSession
vi.mock('./session', () => ({
  sealSession: vi.fn()
}))

// Import after mocking
const { TokenRefresher } = await import('./tokenRefresher')
const { authkit } = await import('./authkit')
const { sealSession } = await import('./session')

describe('TokenRefresher', () => {
  let tokenRefresher: InstanceType<typeof TokenRefresher>
  
  beforeEach(() => {
    tokenRefresher = new TokenRefresher()
    vi.clearAllMocks()
  })

  afterEach(() => {
    tokenRefresher.stopTokenRefresh()
  })

  describe('User Field Mapping', () => {
    it('should correctly map snake_case user fields to camelCase', async () => {
      // Mock WorkOS API response with snake_case fields
      const mockWorkOSResponse = {
        access_token: 'new_access_token',
        refresh_token: 'new_refresh_token',
        token_type: 'Bearer',
        expires_in: 3600,
        user: {
          object: 'user',
          id: 'user_123',
          email: 'test@example.com',
          email_verified: true,
          profile_picture_url: 'https://example.com/pic.jpg',
          first_name: 'John',  // snake_case
          last_name: 'Doe',    // snake_case
          last_sign_in_at: '2024-01-01T00:00:00.000Z',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          external_id: 'ext_123',
          metadata: { role: 'admin' }
        },
        impersonator: null
      }

      // Mock session data from authkit.checkStorageBasedSession
      const mockSessionData = {
        user: { 
          id: 'user_123', 
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User'
        },
        accessToken: 'old_token',
        refreshToken: 'old_refresh_token',
        source: 'cookie' as const,
        cookieName: 'authkit-session',
        originalFormat: 'legacy',
        originalCookieValue: 'old_cookie_value',
        claims: { exp: 1234567890 },
        sessionId: 'session_123',
        impersonator: null
      }

      // Setup mocks
      vi.mocked(authkit.checkStorageBasedSession).mockResolvedValue(mockSessionData)
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockWorkOSResponse)
      })
      vi.mocked(sealSession).mockResolvedValue('sealed_session_value')
      mockChrome.cookies.set.mockResolvedValue(true)

      // Access the private method for testing
      const refreshTokensMethod = (tokenRefresher as any).refreshTokens.bind(tokenRefresher)
      await refreshTokensMethod(mockSessionData)

      // Verify sealSession was called with properly mapped user fields
      expect(vi.mocked(sealSession)).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({
            // Check that snake_case fields were mapped to camelCase
            firstName: 'John',  // mapped from first_name
            lastName: 'Doe',    // mapped from last_name
            emailVerified: true, // mapped from email_verified
            profilePictureUrl: 'https://example.com/pic.jpg', // mapped from profile_picture_url
            lastSignInAt: '2024-01-01T00:00:00.000Z', // mapped from last_sign_in_at
            createdAt: '2024-01-01T00:00:00.000Z', // mapped from created_at
            updatedAt: '2024-01-01T00:00:00.000Z', // mapped from updated_at
            externalId: 'ext_123', // mapped from external_id
            // Fields that don't need mapping
            object: 'user',
            id: 'user_123',
            email: 'test@example.com',
            metadata: { role: 'admin' }
          })
        })
      )
    })

    it('should handle null values in user fields', async () => {
      const mockWorkOSResponse = {
        access_token: 'new_access_token',
        refresh_token: 'new_refresh_token',
        token_type: 'Bearer',
        expires_in: 3600,
        user: {
          object: 'user',
          id: 'user_123',
          email: 'test@example.com',
          email_verified: false,
          profile_picture_url: null,  // null value
          first_name: 'John',
          last_name: 'Doe',
          last_sign_in_at: null,  // null value
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          external_id: null,  // null value
          metadata: null  // null value
        },
        impersonator: null
      }

      const mockSessionData = {
        user: { 
          id: 'user_123', 
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User'
        },
        accessToken: 'old_token',
        refreshToken: 'old_refresh_token',
        source: 'cookie' as const,
        cookieName: 'authkit-session',
        originalFormat: 'legacy',
        originalCookieValue: 'old_cookie_value',
        claims: { exp: 1234567890 },
        sessionId: 'session_123',
        impersonator: null
      }

      vi.mocked(authkit.checkStorageBasedSession).mockResolvedValue(mockSessionData)
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockWorkOSResponse)
      })
      vi.mocked(sealSession).mockResolvedValue('sealed_session_value')
      mockChrome.cookies.set.mockResolvedValue(true)

      const refreshTokensMethod = (tokenRefresher as any).refreshTokens.bind(tokenRefresher)
      await refreshTokensMethod(mockSessionData)

      expect(vi.mocked(sealSession)).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({
            profilePictureUrl: null,
            lastSignInAt: null,
            externalId: null,
            metadata: {} // Should default to empty object
          })
        })
      )
    })

    it('should prevent React key conflicts by ensuring no undefined values', async () => {
      const mockWorkOSResponse = {
        access_token: 'new_access_token',
        refresh_token: 'new_refresh_token',
        token_type: 'Bearer',
        expires_in: 3600,
        user: {
          object: 'user',
          id: 'user_123',
          email: 'test@example.com',
          // Missing optional fields to test our mapping handles undefined
          email_verified: undefined,
          profile_picture_url: undefined,
          first_name: 'John',
          last_name: 'Doe',
          last_sign_in_at: undefined,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
          external_id: undefined,
          metadata: undefined
        },
        impersonator: null
      }

      const mockSessionData = {
        user: { 
          id: 'user_123', 
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User'
        },
        accessToken: 'old_token',
        refreshToken: 'old_refresh_token',
        source: 'cookie' as const,
        cookieName: 'authkit-session',
        originalFormat: 'legacy',
        originalCookieValue: 'old_cookie_value',
        claims: { exp: 1234567890 },
        sessionId: 'session_123',
        impersonator: null
      }

      vi.mocked(authkit.checkStorageBasedSession).mockResolvedValue(mockSessionData)
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockWorkOSResponse)
      })
      vi.mocked(sealSession).mockResolvedValue('sealed_session_value')
      mockChrome.cookies.set.mockResolvedValue(true)

      const refreshTokensMethod = (tokenRefresher as any).refreshTokens.bind(tokenRefresher)
      await refreshTokensMethod(mockSessionData)

      // Get the actual call arguments
      const sealSessionCall = vi.mocked(sealSession).mock.calls[0][0]
      const userObject = sealSessionCall.user

      // Ensure no undefined values that could cause React key conflicts
      expect(userObject.firstName).toBe('John')
      expect(userObject.lastName).toBe('Doe')
      expect(userObject.emailVerified).toBe(false) // Should default to false, not undefined
      expect(userObject.profilePictureUrl).toBe(null) // Should be null, not undefined
      expect(userObject.lastSignInAt).toBe(null) // Should be null, not undefined
      expect(userObject.externalId).toBe(null) // Should be null, not undefined
      expect(userObject.metadata).toEqual({}) // Should be empty object, not undefined

      // Verify no property has undefined value
      Object.values(userObject).forEach(value => {
        expect(value).not.toBe(undefined)
      })
    })
  })

  describe('Token Refresh Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      const mockSessionData = {
        user: { 
          id: 'user_123', 
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User'
        },
        accessToken: 'old_token',
        refreshToken: 'old_refresh_token',
        source: 'cookie' as const
      }

      vi.mocked(authkit.checkStorageBasedSession).mockResolvedValue(mockSessionData)
      ;(global.fetch as any).mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized')
      })

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const refreshTokensMethod = (tokenRefresher as any).refreshTokens.bind(tokenRefresher)
      await refreshTokensMethod(mockSessionData)

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error refreshing tokens:',
        expect.any(Error)
      )

      consoleSpy.mockRestore()
    })

    it('should handle missing refresh token', async () => {
      const mockSessionData = {
        user: { 
          id: 'user_123', 
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User'
        },
        accessToken: 'old_token',
        // Missing refreshToken
        source: 'cookie' as const,
        claims: { exp: 1234567890 },
        sessionId: 'session_123',
        impersonator: null,
        originalFormat: 'legacy',
        cookieName: 'authkit-session',
        originalCookieValue: 'old_cookie_value'
      } as any

      // Since we removed the console.log, verify that the method exits early
      // without making any API calls
      const refreshTokensMethod = (tokenRefresher as any).refreshTokens.bind(tokenRefresher)
      await refreshTokensMethod(mockSessionData)

      // Verify no fetch calls were made (since no refresh token)
      expect(global.fetch).not.toHaveBeenCalled()
    })
  })
})
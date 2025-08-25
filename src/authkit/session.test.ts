import { describe, it, expect } from 'vitest';
import { sealSession, unsealSession } from './session';
import { sealData, unsealData } from 'iron-session';
import config from '../../config.json';

describe('Session Sealing/Unsealing', () => {
  const testSessionData = {
    accessToken: 'test_access_token_12345',
    refreshToken: 'test_refresh_token_67890',
    user: {
      object: 'user',
      id: 'user_test123',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      emailVerified: true,
      profilePictureUrl: null,
      lastSignInAt: '2024-01-01T00:00:00.000Z',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      externalId: null,
      metadata: {},
    },
    impersonator: null,
  };

  const ironSessionOptions = {
    password: config.cookiePassword,
    ttl: 24 * 60 * 60 * 1000, // 24 hours
  };

  describe('sealSession', () => {
    it('should seal session data with iron-session compatible format', async () => {
      const sealed = await sealSession(testSessionData);

      expect(sealed).toBeTypeOf('string');
      expect(sealed).toMatch(
        /^Fe26\.2\*1\*[a-f0-9]*\*[A-Za-z0-9_-]*\*[A-Za-z0-9_-]*\*\d+\*[a-f0-9]*\*[A-Za-z0-9_-]*~2$/,
      );
      expect(sealed.split('*')).toHaveLength(8); // Should have 8 parts for iron-session compatibility
    });

    it('should always use iron-session compatible format', async () => {
      const sealed = await sealSession(testSessionData);

      expect(sealed).toBeTypeOf('string');
      expect(sealed).toMatch(/^Fe26\.2/);
    });

    it('should produce unique sealed results for each call', async () => {
      const sealed1 = await sealSession(testSessionData);
      const sealed2 = await sealSession(testSessionData);

      expect(sealed1).toBeTypeOf('string');
      expect(sealed2).toBeTypeOf('string');
      expect(sealed1).not.toBe(sealed2); // Should be different due to random salts/IVs
    });
  });

  describe('unsealSession', () => {
    it('should unseal data that was sealed by our sealSession function', async () => {
      const sealed = await sealSession(testSessionData);
      const unsealed = await unsealSession(sealed);

      expect(unsealed).toEqual(testSessionData);
    });

    it('should handle malformed sealed data gracefully', async () => {
      const malformedData = 'invalid_sealed_data';

      await expect(unsealSession(malformedData)).rejects.toThrow();
    });
  });

  describe('Iron-session Compatibility', () => {
    it('should be compatible with iron-session sealing', async () => {
      // Seal with iron-session
      const ironSealed = await sealData(testSessionData, ironSessionOptions);

      // Our unseal should be able to read iron-session sealed data
      const ourUnsealed = await unsealSession(ironSealed);

      expect(ourUnsealed).toEqual(testSessionData);
    });

    it('should produce data that iron-session can unseal', async () => {
      // Seal with our implementation
      const ourSealed = await sealSession(testSessionData);

      // Iron-session should be able to unseal our data
      const ironUnsealed = await unsealData(ourSealed, ironSessionOptions);

      expect(ironUnsealed).toEqual(testSessionData);
    });

    it('should maintain data integrity through round-trip with iron-session', async () => {
      // Our seal -> iron-session unseal -> iron-session seal -> our unseal
      const ourSealed = await sealSession(testSessionData);
      const ironUnsealed = await unsealData(ourSealed, ironSessionOptions);
      const ironResealed = await sealData(ironUnsealed, ironSessionOptions);
      const ourFinalUnsealed = await unsealSession(ironResealed);

      expect(ourFinalUnsealed).toEqual(testSessionData);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty session data', async () => {
      const emptyData = {};
      const sealed = await sealSession(emptyData);
      const unsealed = await unsealSession(sealed);

      expect(unsealed).toEqual(emptyData);
    });

    it('should handle session data with null values', async () => {
      const dataWithNulls = {
        ...testSessionData,
        impersonator: null,
        user: {
          ...testSessionData.user,
          externalId: null,
          profilePictureUrl: null,
        },
      };

      const sealed = await sealSession(dataWithNulls);
      const unsealed = await unsealSession(sealed);

      expect(unsealed).toEqual(dataWithNulls);
    });

    it('should handle large session data', async () => {
      const largeData = {
        ...testSessionData,
        user: {
          ...testSessionData.user,
          metadata: {
            // Add large metadata object
            largeField: 'x'.repeat(10000),
            nestedObject: {
              level1: { level2: { level3: 'deep_value' } },
            },
            arrayField: new Array(1000).fill('item'),
          },
        },
      };

      const sealed = await sealSession(largeData);
      const unsealed = await unsealSession(sealed);

      expect(unsealed).toEqual(largeData);
    });
  });

  describe('Format Validation', () => {
    it('should produce consistent format structure', async () => {
      const sealed1 = await sealSession(testSessionData);
      const sealed2 = await sealSession(testSessionData);

      // Both should have the same structure (8 parts)
      expect(sealed1.split('*')).toHaveLength(8);
      expect(sealed2.split('*')).toHaveLength(8);

      // Both should start with Fe26.2 and end with ~2
      expect(sealed1).toMatch(/^Fe26\.2.*~2$/);
      expect(sealed2).toMatch(/^Fe26\.2.*~2$/);

      // They should be different due to random salts and IVs
      expect(sealed1).not.toBe(sealed2);
    });

    it('should match iron-session format exactly', async () => {
      const ourSealed = await sealSession(testSessionData);
      const ironSealed = await sealData(testSessionData, ironSessionOptions);

      // Both should have same number of parts
      expect(ourSealed.split('*')).toHaveLength(ironSealed.split('*').length);

      // Both should have same prefix and suffix
      expect(ourSealed.startsWith('Fe26.2')).toBe(true);
      expect(ourSealed.endsWith('~2')).toBe(true);
      expect(ironSealed.startsWith('Fe26.2')).toBe(true);
      expect(ironSealed.endsWith('~2')).toBe(true);
    });
  });
});

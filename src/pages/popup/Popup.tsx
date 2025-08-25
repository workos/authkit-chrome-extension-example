import { useEffect, useState } from 'react';
import { authkit } from '../../authkit/authkit';

type SessionStatus = {
  isAuthenticated: boolean;
  user?: {
    email: string;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
  expiresIn?: number;
};

export default function Popup() {
  const [status, setStatus] = useState<SessionStatus>({ isAuthenticated: false });
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  // Check session status when popup opens
  useEffect(() => {
    checkSessionStatus();
  }, []);

  const checkSessionStatus = async () => {
    setLoading(true);
    try {
      // Debug: Check what cookies are available
      const cookies = await chrome.cookies.getAll({
        url: 'http://localhost:3000',
      });
      console.log(
        '🍪 POPUP: Available cookies:',
        cookies.map(c => ({
          name: c.name,
          domain: c.domain,
          httpOnly: c.httpOnly,
          value: c.value.substring(0, 20) + '...',
        })),
      );

      const auth = await authkit.withAuth();

      // If we have a session, notify the service worker
      if (auth.user && auth.accessToken) {
        chrome.runtime
          .sendMessage({
            action: 'sessionActive',
            user: auth.user,
            hasAccessToken: true,
          })
          .catch(error => {
            console.error('❌ POPUP: Failed to notify service worker:', error);
          });
      } else {
      }

      setStatus({
        isAuthenticated: !!auth.user,
        user: auth.user
          ? {
              email: typeof auth.user.email === 'string' ? auth.user.email : '',
              firstName: typeof auth.user.firstName === 'string' ? auth.user.firstName : null,
              lastName: typeof auth.user.lastName === 'string' ? auth.user.lastName : null,
            }
          : null,
        // Note: authkit-js doesn't expose token expiration directly
        // The client handles automatic refresh internally
        expiresIn: undefined,
      });
    } catch (error) {
      console.error('💥 POPUP: Error checking session:', error);
      setStatus({ isAuthenticated: false });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      // Get current session before terminating
      const auth = await authkit.withAuth();

      if (auth.user) {
        // Call authkit's signOut method to properly clear all cookies
        await authkit.signOut();

        // Also notify background script to stop maintenance
        await chrome.runtime.sendMessage({
          action: 'terminateSession',
        });

        // Reset status after logout
        setStatus({ isAuthenticated: false });
      }
    } catch (error) {
      console.error('Error logging out:', error);
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="h-full p-5 bg-gray-100 flex flex-col">
      <h1 className="text-xl font-bold mb-4">AuthKit Session</h1>

      {loading ? (
        <div className="flex justify-center items-center flex-1">
          <div className="animate-spin h-6 w-6 border-2 border-blue-500 rounded-full border-t-transparent"></div>
        </div>
      ) : (
        <div className="flex-1">
          {status.isAuthenticated ? (
            <div className="space-y-4">
              <div className="bg-white p-4 rounded shadow">
                <h2 className="font-semibold text-gray-700">Logged in as:</h2>
                <p className="text-blue-600 mt-1">{status.user?.email}</p>

                {status.user?.firstName && (
                  <p className="mt-2 text-gray-600">
                    {status.user.firstName} {status.user.lastName}
                  </p>
                )}

                {status.expiresIn !== undefined && (
                  <p className="text-sm text-gray-500 mt-2">
                    Session expires in: {Math.floor(status.expiresIn / 60)} minutes
                  </p>
                )}
              </div>

              <button
                className={`w-full py-2 px-4 rounded ${
                  loggingOut ? 'bg-gray-400 cursor-not-allowed' : 'bg-red-500 hover:bg-red-600 text-white'
                }`}
                onClick={handleLogout}
                disabled={loggingOut}
              >
                {loggingOut ? 'Logging out...' : 'Log Out'}
              </button>
            </div>
          ) : (
            <div className="bg-white p-4 rounded shadow text-center">
              <p className="text-gray-700">Not logged in</p>
              <p className="text-sm text-gray-500 mt-2">Visit an AuthKit-enabled site to log in</p>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-gray-200">
        <button
          className="w-full py-2 px-4 bg-blue-500 text-white rounded hover:bg-blue-600"
          onClick={checkSessionStatus}
        >
          Refresh Status
        </button>
      </div>
    </div>
  );
}

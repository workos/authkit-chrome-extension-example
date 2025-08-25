# AuthKit Chrome Extension Example

A Chrome extension that keeps AuthKit sessions alive through automatic token refresh, solving the common problem of sessions expiring when users close their AuthKit application tabs.

## Problem Solved

When using AuthKit applications, sessions typically expire when users close all browser tabs containing the application. This extension solves that by:

- **Detecting active AuthKit sessions** across different AuthKit SDK implementations
- **Automatically refreshing tokens** before they expire (every 10 seconds, with 5-minute buffer)
- **Maintaining session continuity** even when application tabs are closed
- **Working in the background** via Chrome's service worker

## Supported AuthKit SDKs

### ✅ Full Support
- **AuthKit React** (`@workos-inc/authkit-js`) with `devMode: true`
  - Sessions stored in localStorage
  - Full token refresh and persistence
  - Tested and working end-to-end

### ⚠️ Partial Support  
- **AuthKit Next.js** (`@workos-inc/authkit-nextjs`) and other cookie-based SDKs
  - Session detection works
  - Token refresh works
  - **Limitation**: Refreshed tokens cannot be saved back to encrypted cookies
  - Sessions will be detected but won't benefit from extended lifetime

## Features

- **Automatic token refresh** using direct WorkOS API calls
- **Cross-SDK session detection** (localStorage and cookie-based)
- **Background operation** continues even with no browser tabs open
- **Session status popup** shows current authentication state
- **Clean logout** clears all session data across tabs and cookies
- **Developer-friendly logging** for debugging session management

## Setup Instructions

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure for your AuthKit application:
   - Copy `config.example.json` to `config.json`
   - Update with your WorkOS credentials:
     ```json
     {
       "clientId": "client_your_workos_client_id",
       "redirectUri": "http://localhost:5173/callback", 
       "cookieDomain": "http://localhost:5173",
       "cookiePassword": "at-least-32-characters-for-iron-session-encryption"
     }
     ```

4. Build the extension:
   ```bash
   npm run build
   ```

## Loading the Extension in Chrome

1. Open Chrome and go to `chrome://extensions`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked" button
4. Select the `dist_chrome` folder from this project

## Usage

### With AuthKit React (`devMode: true`)

1. Start your AuthKit React application on the configured port (e.g., `localhost:5173`)
2. Login to your application
3. Open the Chrome extension popup - you should see your active session
4. Close your application tab
5. **Session stays alive!** The extension continues refreshing tokens in the background

### Verification

Check the Chrome DevTools console (Background page) to see token refresh activity:

```
Session detected on AuthKit-enabled website - starting token refresh
Starting token refresh management
Checking session status...
Token expiring soon, refreshing...
Refreshing tokens via WorkOS API...
Tokens refreshed successfully
Updated session saved successfully
```

### With Cookie-based AuthKit SDKs

The extension will detect and display cookie-based sessions but cannot extend their lifetime due to cookie re-encryption complexity. This is documented as a known limitation.

## Architecture

### Core Components

- **`tokenRefresher.ts`** - Manages automatic token refresh with WorkOS API
- **`sessionUnseal.ts`** - Detects sessions from localStorage and encrypted cookies  
- **`authkit.ts`** - Main interface providing session management methods
- **`background/index.ts`** - Service worker handling session lifecycle

### Token Refresh Flow

1. **Detection**: Extension detects AuthKit sessions on page load
2. **Monitoring**: Checks token expiry every 10 seconds
3. **Refresh**: Calls WorkOS API when tokens expire within 5 minutes
4. **Persistence**: Saves new tokens back to localStorage (React) or logs for cookies
5. **Continuation**: Process repeats automatically

## Development

For development with hot reloading:

```bash
npm run dev
```

### Debugging

- Check service worker console: `chrome://extensions` → Extension Details → "service worker" link
- Enable verbose logging by uncommenting debug statements in the codebase
- Use the extension popup to verify session detection

## Known Limitations

1. **Cookie session persistence**: Cannot re-encrypt and save refreshed tokens to cookies (Next.js/SSR apps)
2. **Error handling**: Basic error logging without retry logic
3. **Network resilience**: No handling of offline/online transitions
4. **Multi-tab coordination**: Updates first matching tab only for localStorage persistence

## Contributing

This is an example implementation demonstrating AuthKit Chrome extension integration patterns. Pull requests welcome for improvements, especially:

- Cookie session re-encryption support
- Enhanced error handling and retry logic
- Better multi-tab session synchronization

## License

MIT
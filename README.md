# ⚠️ ARCHIVED - Security Notice

**This project has been archived due to fundamental security design issues and should not be used in production.**

## Why This Project Was Archived

This Chrome extension example demonstrates an **insecure authentication pattern** that exposes sensitive credentials:

1. **API Key Exposure**: The WorkOS API key is bundled into the Chrome extension, making it accessible to any user who inspects the extension's code. API keys should never be exposed in client-side code.

2. **Cookie Password Exposure**: The cookie encryption password is included in the extension's configuration, compromising session security. Cookie passwords must remain server-side only.

3. **Direct API Access**: Chrome extensions should not make direct calls to authentication APIs with embedded credentials. All authentication flows should be handled through a secure backend service.

## Security Best Practices

If you need to implement authentication in a Chrome extension with WorkOS AuthKit:

- **Use a Backend Service**: Create a secure backend API that handles all WorkOS authentication operations
- **Implement OAuth 2.0 Flow**: Use the proper OAuth flow with your backend as the intermediary
- **Store Tokens Securely**: Use Chrome's storage API with proper encryption for any tokens
- **Never Embed Secrets**: API keys, client secrets, and cookie passwords must never appear in extension code

## Recommended Approach

For a secure AuthKit integration:
1. Set up a backend service that handles AuthKit operations
2. Use the Chrome Identity API for OAuth flows
3. Communicate with your backend using secure, authenticated requests
4. Review the [WorkOS AuthKit documentation](https://workos.com/docs/authkit) for server-side implementation

## Original README

# AuthKit Chrome Extension Example

A Chrome extension that integrates with WorkOS AuthKit for authentication management.



https://github.com/user-attachments/assets/e7b90729-a200-4743-9a9f-1294ebb2e698



## Features

- Manage AuthKit sessions within Chrome browser
- Monitor and automatically refresh authentication tokens
- View current session status in popup interface
- Log out from the extension popup

## Setup Instructions

1. Clone this repository
2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Create a configuration file:
   - Copy `config.example.json` to `config.json`
   - Fill in your WorkOS credentials:
     ```json
     {
       "apiKey": "your_workos_api_key",
       "clientId": "your_workos_client_id",
       "cookiePassword": "must be at least 32 characters long",
       "cookieDomain": "http://localhost:3000",
       "redirectUri": "http://localhost:3000/callback"
     }
     ```

4. Build the extension:
   ```
   pnpm build
   ```

## Loading the Extension in Chrome

1. Open Chrome and go to `chrome://extensions`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked" button
4. Select the `dist_chrome` folder from this project

## Usage with AuthKit Example App

This extension is designed to work with the [next-authkit-example](https://github.com/workos/next-authkit-example) application as an example AuthKit app. You'll need to run both this extension and the next-authkit-example app together for full functionality. The extension will manage the AuthKit sessions created by the example app.

## Development

For development with hot reloading:

```
pnpm dev
```

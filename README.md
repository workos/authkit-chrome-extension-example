# AuthKit Chrome Extension Example

A Chrome extension that integrates with WorkOS AuthKit for authentication management.

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

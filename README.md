# AuthKit Chrome Extension

A Chrome extension that keeps AuthKit sessions alive by automatically refreshing tokens before they expire.

## What it does

If you use AuthKit for authentication, this extension detects your sessions and refreshes tokens in the background. No more getting logged out unexpectedly.

Works with:

- AuthKit React (`@workos-inc/authkit-react` with `devMode: true`)
- AuthKit Next.js (cookie-based sessions)
- Any AuthKit implementation using localStorage or cookies

## Quick start

1. Clone and install:

```bash
git clone git@github.com/workos/authkit-chrome-extension-example.git
cd authkit-chrome-example
pnpm install
```

2. Copy and configure:

```bash
cp config.example.json config.json
```

Edit `config.json`:

```json
{
  "clientId": "client_YOUR_WORKOS_CLIENT_ID",
  "redirectUri": "http://localhost:5173/callback",
  "cookieDomain": "http://localhost:5173",
  "cookiePassword": "at-least-32-chars-for-encryption"
}
```

3. Build and load:

```bash
pnpm build
```

Then in Chrome:

- Go to `chrome://extensions`
- Enable Developer mode
- Load unpacked → select `dist_chrome` folder

## How it works

The extension runs a background service worker that:

1. Checks for AuthKit sessions every 10 seconds
2. Detects sessions in localStorage (React) or encrypted cookies (Next.js)
3. Refreshes tokens 5 minutes before they expire via WorkOS API
4. Updates the session in the same storage it came from

Key files:

- `src/authkit/tokenRefresher.ts` - Token refresh logic
- `src/authkit/session.ts` - Session detection and cookie encryption
- `src/pages/background/index.ts` - Service worker orchestration

## Development

```bash
pnpm dev           # Watch mode with hot reload
pnpm type-check    # TypeScript validation
pnpm test          # Run tests
```

### Debugging

Check the service worker console:

1. Go to `chrome://extensions`
2. Find this extension → click "service worker"
3. Watch the logs for session detection and refresh events

The popup (extension icon) shows current session status and user info.

## Configuration

### For different environments

Update `config.json` with your environment's values:

- `clientId`: Your WorkOS client ID
- `redirectUri`: Your app's callback URL
- `cookieDomain`: Your app's domain (for cookie access)
- `cookiePassword`: 32+ character key for iron-session encryption

### Timing adjustments

In `src/authkit/tokenRefresher.ts`:

- `checkIntervalMs`: How often to check tokens (default: 10 seconds)
- `refreshBufferSeconds`: How early to refresh before expiry (default: 5 minutes)

## Limitations

- Requires the AuthKit app tab to be open for localStorage updates
- Cookie encryption must match your app's iron-session configuration

## Troubleshooting

**Session not detected:**

- Check the service worker console for errors
- Verify your `config.json` matches your AuthKit setup
- For Next.js apps, ensure `cookiePassword` matches your app's secret

**Tokens not refreshing:**

- Check network tab for failed requests to WorkOS API
- Verify your `clientId` is correct
- Look for "Token refresh failed" errors in console

**Extension not loading:**

- Run `pnpm build` first
- Make sure you're loading `dist_chrome`, not the source directory
- Check for TypeScript errors: `pnpm type-check`

## License

MIT


# AuthKit Chrome Extension Example

> [!WARNING]
> This is example code provided as-is for demonstration purposes. It may not be production-ready and is not officially
> supported by WorkOS. Use at your own risk.

A sophisticated Chrome extension that maintains AuthKit sessions through intelligent session detection and automatic token refresh across multiple AuthKit SDK implementations. Built with TypeScript, React, and comprehensive error handling.

## Problem Solved

Modern AuthKit applications face session continuity challenges when users navigate between tabs or close browser windows. This extension provides a robust solution by:

- **Universal Session Detection** - Automatically detects AuthKit sessions across localStorage and cookie-based implementations
- **Intelligent Token Refresh** - Proactively refreshes tokens using direct WorkOS API calls with proper error handling
- **Cross-SDK Compatibility** - Works seamlessly with AuthKit React, Next.js, and other AuthKit SDKs
- **Background Persistence** - Maintains sessions via Chrome service worker even when application tabs are closed
- **Advanced Encryption** - Handles iron-session compatible cookie encryption/decryption

## Supported AuthKit SDKs

- **AuthKit React** (`@workos-inc/authkit-js`) with `devMode: true`

  - Sessions stored in localStorage
  - Complete token refresh and persistence
  - Full error handling and type safety
  - Tested and verified end-to-end

- **AuthKit Next.js** (`@workos-inc/authkit-nextjs`) and cookie-based SDKs
  - Advanced session detection from encrypted cookies
  - Token refresh with automatic cookie re-encryption
  - Iron-session compatibility for cookie sealing/unsealing
  - Proper error boundaries and fallback handling

### ✅ Additional Support

- **Generic AuthKit implementations** using localStorage or cookie sessions
- **Multi-tenant configurations** with proper domain isolation
- **Development and production environments** with configurable settings

## Key Features

### Advanced Session Management

- **Multi-source detection** - localStorage, cookies, and mixed implementations
- **Intelligent session validation** - JWT parsing and expiry checking
- **Graceful degradation** - Fallback mechanisms for incomplete session data
- **Cross-tab synchronization** - Updates all application tabs simultaneously

### Robust Token Refresh

- **Direct WorkOS API integration** - No dependency on authkit-ssr
- **Configurable timing** - 10-second checks with 5-minute refresh buffer
- **Error resilience** - Comprehensive error handling and logging
- **Type-safe implementation** - Full TypeScript coverage with proper interfaces

## Architecture Overview

### Core Components

- **`tokenRefresher.ts`** - Production-ready token refresh management with error handling
- **`session.ts`** - Advanced session detection supporting multiple storage formats and encryption
- **`authkit.ts`** - Unified interface for cross-SDK session management
- **`background/index.ts`** - Service worker handling session lifecycle and message routing
- **`jwtUtils.ts`** - JWT parsing and validation utilities
- **Strong TypeScript interfaces** - Comprehensive type safety throughout

### Session Detection Flow

```
1. Multi-source Detection
   ├── localStorage (React devMode)
   ├── Encrypted cookies (Next.js/iron-session)
   └── Mixed implementations

2. Session Validation
   ├── JWT parsing and expiry checking
   ├── User data validation
   └── Token format verification

3. Background Management
   ├── Service worker initialization
   ├── Automatic session monitoring
   └── Cross-tab state synchronization
```

### Token Refresh Pipeline

```
1. Continuous Monitoring (10s intervals)
   ├── JWT expiry analysis
   ├── 5-minute refresh buffer
   └── Network connectivity checks

2. WorkOS API Integration
   ├── Secure refresh token exchange
   ├── Response validation
   └── Error handling with fallbacks

3. Session Persistence
   ├── localStorage updates (React)
   ├── Cookie re-encryption (Next.js)
   └── Cross-tab notifications
```

## Setup Instructions

### Prerequisites

- Node.js 18+ with pnpm
- Chrome browser for development
- WorkOS account with configured AuthKit application

### Installation

1. **Clone and install dependencies**:

   ```bash
   git clone <repository-url>
   cd authkit-chrome-example
   pnpm install
   ```

2. **Configure for your AuthKit application**:

   ```bash
   cp config.example.json config.json
   ```

   Update `config.json` with your WorkOS credentials:

   ```json
   {
     "clientId": "client_your_workos_client_id",
     "redirectUri": "http://localhost:5173/callback",
     "cookieDomain": "http://localhost:5173",
     "cookiePassword": "at-least-32-characters-for-iron-session-encryption"
   }
   ```

3. **Build the extension**:

   ```bash
   pnpm build
   ```

4. **Load in Chrome**:
   - Navigate to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist_chrome` folder

## Usage Examples

### With AuthKit React (localStorage)

```typescript
// Your React app configuration
<AuthKitProvider devMode={true} clientId={clientId}>
  <App />
</AuthKitProvider>
```

**Extension behavior:**

- Detects session automatically when visiting your app
- Monitors token expiry every 10 seconds
- Refreshes tokens 5 minutes before expiry
- Updates localStorage across all tabs
- Maintains session even when tabs are closed

### With AuthKit Next.js (cookies)

```typescript
// Your Next.js configuration
const workos = new WorkOS(process.env.WORKOS_API_KEY);
const { user } = await workos.userManagement.authenticate({
  /* ... */
});
```

**Extension behavior:**

- Detects encrypted session cookies
- Decrypts using iron-session compatibility
- Refreshes tokens via WorkOS API
- Re-encrypts and updates cookies automatically
- Handles complex cookie configurations

## Development

### Development Mode

```bash
pnpm dev  # Hot reloading enabled
```

### Type Checking

```bash
pnpm type-check  # Comprehensive TypeScript validation
```

### Testing

```bash
pnpm test      # Run test suite
pnpm test:run  # Single test run
```

### Debugging

**Service Worker Console:**

- Navigate to `chrome://extensions`
- Find your extension → "service worker" link
- Monitor real-time session management logs

**Extension Popup:**

- Click extension icon to view current session state
- Verify user data and authentication status

**Key Log Messages:**

```
✅ Session detected - starting token refresh
⏰ Token expires in 4.5 minutes - refreshing now
🔄 Tokens refreshed successfully via WorkOS API
💾 Session updated in localStorage/cookies
🔒 Cookie sealed with iron-session format
```

## Configuration Options

### Environment-Specific Settings

```json
{
  "clientId": "client_xxx",
  "redirectUri": "https://myapp.com/callback",
  "cookieDomain": "https://myapp.com",
  "cookiePassword": "production-secret-key",
  "refreshBufferMinutes": 5,
  "checkIntervalSeconds": 10
}
```

### Advanced Configuration

- **Custom domains** - Configure multiple domain patterns
- **Token refresh timing** - Adjust check intervals and refresh buffers
- **Cookie encryption** - Use custom iron-session passwords
- **Development modes** - Enable verbose logging and debugging

## Production Considerations

### Security

- Secure credential storage in extension context
- Proper token validation and sanitization
- HTTPS-only cookie handling in production
- Cross-origin request validation

### Performance

- Efficient background processing with service workers
- Memory-conscious session management
- Minimal API calls with intelligent timing
- Graceful handling of network failures

### Monitoring

- Comprehensive error logging and reporting
- Session state tracking and validation
- API response monitoring and alerting
- User experience metrics

## Known Limitations

1. **HTTP-only cookies** - Cannot access from extensions (by design)
2. **Iron-session versions** - May require compatibility updates for newer versions
3. **Network dependency** - Requires internet connectivity for token refresh
4. **Single-domain focus** - Optimized for single AuthKit application domains

## Advanced Topics

### Custom Session Storage

Extend the session detection to support additional storage mechanisms:

```typescript
// Add custom session source
const customSession = await detectCustomSession();
if (customSession) {
  tokenRefresher.startTokenRefresh();
}
```

### Multi-Domain Support

Configure for multiple AuthKit applications:

```typescript
// Support multiple domains
const domains = ['app1.com', 'app2.com'];
domains.forEach(domain => configureForDomain(domain));
```

## Contributing

This project demonstrates advanced AuthKit integration patterns. Contributions welcome for:

- Additional AuthKit SDK support
- Enhanced error handling and retry logic
- Multi-domain session management
- Performance optimizations
- Security enhancements

### Development Guidelines

- Follow TypeScript strict mode
- Maintain comprehensive error handling
- Add tests for new functionality
- Document architectural decisions
- Preserve backward compatibility

## License

MIT

---

Built with ❤️ for the WorkOS community. This example demonstrates production-ready patterns for AuthKit Chrome extension integration.


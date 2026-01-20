# DiscorDManager - AI Coding Agent Instructions

## Project Overview
Node.js CLI tool for batch-managing Discord Direct Messages at scale. Processes Discord data packages to systematically close, reopen, and export DMs using Discord Chat Exporter integration. Supports filtering by channel type (DM/GROUP_DM), safe rate limiting with random delays, and DRY_RUN testing mode.

## Architecture & Key Components

### Module Organization
**Entry Points:**
- `src/cli/menu-main.js` - Interactive CLI menu (npm start)
- `src/batch/batch-entry.js` - Direct batch processing (npm run batch)

**Core Services:**
- `src/discord-api.js` - Discord API v9 client (rate limiting, retry logic, user validation)
- `src/config.js` - ConfigManager singleton (.env + config.json)
- `src/logger.js` - Automatic console capture to dated log files

**Menu System (src/cli/):**
- `menu-main.js` - Main menu orchestration
- `menu-config.js` - Configuration submenu
- `menu-api.js` - API operations (export, close/reopen DMs, reset state)
- `menu-base.js` - Shared menu base class
- `menu-helpers.js` - Display utilities

**Batch Processing (src/batch/):**
- `batch-processor.js` - Core DM processing:
  - `closeAllOpenDMs()` - Closes all open DMs, saves channel data to id-history.json
  - `processAndExportAllDMs(exportCallback, rlInterface, typeFilter)` - Main export workflow
  - `initializeBatchProcessing(typeFilter)` - Setup with channel type filtering
- `batch-state.js` - Persistent state for interrupted sessions

**Utilities (src/lib/):**
- `cli-helpers.js` - Input prompts, progress bars, DCE spawn wrapper
  - `exportDMs(token, exportPath, dcePath, userId)` - Exports DMs in JSON (messages.json) and returns {success, results}
  - `runDCEExport()` - Spawns DiscordChatExporter.Cli with proper args
- `file-utils.js` - File operations, JSON atomic writes
  - `traverseDataPackage()` - Finds all channel.json files
  - `getRecipients(paths, userId, typeFilter)` - Extracts recipient IDs by channel type
  - `updateIdHistory()` - Maintains originalState/latest/uniqueChannels/exportStatus structure
  - `getExportStatus()` - Retrieves export status map from id-history.json
  - `updateExportStatus(path, channelId, status)` - Updates export status for a channel
  - `getChannelsToExport(path, recipientIds)` - Filters out completed exports
  - `getCompletedExports()` - Returns array of completed channel IDs
- `config-validators.js` - Path validation, user ID verification
- `config-defaults.js` - Export path resolution
- `rate-limiter.js` - RateLimiter class + randomDelay()
- `api-delay-tracker.js` - Singleton for tracking API calls with random delays
- `dry-run-helper.js` - DRY_RUN mode utilities
- `validators.js` - Path and DCE validation

### Critical Data Flow
**Main Export Workflow:**
1. Parse Discord data package → extract DM recipients from channel.json files (filter by DM/GROUP_DM type)
2. Close all currently open DMs → save channel data to id-history.json
3. Check export status → skip already completed exports (resume functionality)
4. Initialize batch processing with typeFilter
5. **Automated Mode**: For each batch:
  - Reopen batch (default: 20 at a time) with user validation
  - Mark channels as 'in-progress' in exportStatus
  - Export via Discord Chat Exporter (JSON only - messages.json)
   - Mark channels as 'completed' or 'failed' based on export result
   - Close batch
   - Apply random delays (0-2s regular, 5-20s pause every 40-50 calls)
   - Repeat until complete

**Reset DM State:**
- Reads id-history.json (latest field)
- Reopens all previously closed DMs
- Used to restore DM state after batch export

**Channel Type Filtering:**
- DM (type=1): 1-on-1 conversations
- GROUP_DM (type=3): Group conversations
- Filter applied during recipient extraction from data package
- User selects filter when exporting (DM only, GROUP_DM only, or Both)

## Configuration System

### File Structure
All configuration stored in `/config/` directory:
- `.env` - Secrets (AUTHORIZATION_TOKEN, USER_DISCORD_ID)
- `config.json` - Application settings
- `batch-state.json` - Auto-managed batch processing state
- Data package stores `{DATA_PACKAGE_FOLDER}/messages/id-history.json`

### config.json Settings
```javascript
{
  "BATCH_SIZE": 20,              // DMs per batch (default: 20)
  "API_DELAY_MS": 100,           // Deprecated - use randomDelay instead
  "MAX_RETRIES": 3,              // API retry attempts
  "RETRY_DELAY_MS": 5000,        // Delay between retries
  "RATE_LIMIT_REQUESTS": 40,     // Max requests per interval (Discord allows 50 req/sec, using 40 for 20% safety buffer)
  "RATE_LIMIT_INTERVAL_MS": 1000, // Rate limit window (1 second)
  "DATA_PACKAGE_FOLDER": "",     // Path to Discord data package
  "EXPORT_PATH": "export",       // DCE output directory
  "DCE_PATH": "",                // DiscordChatExporter.Cli directory
  "DRY_RUN": false               // Test mode (no API calls)
}
```

### .env Variables
```bash
AUTHORIZATION_TOKEN=your_discord_token_here
USER_DISCORD_ID=your_user_id_here
```

### id-history.json Structure
Located at `{DATA_PACKAGE_FOLDER}/messages/id-history.json`:
```javascript
{
  "originalState": [...],     // First capture from closeAllOpenDMs
  "latest": [...],            // Most recent close (type=1 DMs only)
  "uniqueChannels": [...],    // All unique channels ever seen
  "exportStatus": {           // Export progress tracking (NEW)
    "channelId1": {
      "status": "completed",  // Status: pending, in-progress, completed, failed
      "timestamp": "2025-12-31T10:30:45.123Z"
    },
    "channelId2": {
      "status": "in-progress",
      "timestamp": "2025-12-31T10:35:20.456Z"
    }
  }
}
```
Each channel object contains full Discord API response data (id, type, recipients array with username/id).

**Export Status:**
- `pending`: Not yet exported (implicit if not in exportStatus)
- `in-progress`: Currently being exported
- `completed`: Successfully exported
- `failed`: Export failed

**Resume Functionality:**
When running export operations, the system automatically:
1. Checks `exportStatus` to identify completed exports
2. Skips channels with `completed` status
3. Updates status to `in-progress` before export
4. Updates to `completed` or `failed` after export attempt
5. Shows count of already-exported and remaining DMs

**Channel Types:**
- Discord data package channel.json: String types ("DM", "GROUP_DM")
- Discord API responses: Numeric types (1=DM, 3=GROUP_DM)

### ConfigManager Usage
```javascript
const { getConfigManager } = require('./config');
const configManager = getConfigManager();
await configManager.init(); // Must call before first use

// Access values
configManager.get('BATCH_SIZE')
configManager.getEnv('AUTHORIZATION_TOKEN')
process.env.AUTHORIZATION_TOKEN // Also works for .env

// Menu classes: Use getter for live updates
get options() { return this.configManager.config; }
```

### Setup Flow
1. Validates DATA_PACKAGE_FOLDER (checks for messages/ directory)
2. Reads user.json, prompts for USER_DISCORD_ID confirmation
3. Prompts for remaining config (auto-defaults EXPORT_PATH)
4. Validates and repairs invalid paths
5. Creates atomic writes to both .env and config.json

## Discord API Patterns

### Rate Limiting
**Two-Layer Protection:**
1. **RateLimiter class**: Token bucket (30 req/60s default)
   - `await rateLimiter.waitForSlot()` before axios calls
2. **Random delays**: Prevent pattern detection
   - Regular: 0-2s random delay per call
   - Long pause: 5-20s every 40-50 calls (for operations >50 total)
   - Tracked via ApiDelayTracker singleton

### User Validation
**Validation is now integrated into `reopenDM()`**:
```javascript
// reopenDM() handles validation inline and returns:
// - null for expected failures (404: user not found, 400: invalid ID, 403: access forbidden)
// - channel object for successful reopen
// - Retries only for auth/network errors (401, 429, 5xx)

const result = await reopenDM(token, userId);
if (result === null) {
    // User doesn't exist or is inaccessible
}
```

### DRY_RUN Mode
**Critical**: Check `configManager.get('DRY_RUN')` BEFORE making API calls:
```javascript
if (isDryRun()) {
    console.log('[DRY RUN] Would perform action');
    return mockResponse;
}
await rateLimiter.waitForSlot(); // Only throttle real calls
```

**Applied in all API functions:**
- `getCurrentOpenDMs()` - Returns empty array
- `reopenDM()` - Returns mock data, skips validation
- `closeDM()` - Returns early
- All batch operations log actions without execution

### API Functions
- `getCurrentOpenDMs(authToken)` - Fetches all open DM channels
- `validateUser(authToken, userId)` - Validates user exists/accessible (exported for testing, prefer using reopenDM)
- `reopenDM(authToken, userId)` - Opens DM with inline validation (returns null for invalid users)
- `closeDM(authToken, channelId)` - Closes DM channel

All use retry logic with exponential backoff for 429 rate limits.

### Error Handling Standards
**Consistent error output across all menu operations:**
- All API operations use `withRetry()` wrapper for consistent retry attempts (1/3, 2/3, 3/3)
- Progress bars must be stopped before error output: `progress.stop(); console.log('');`
- Error messages have newline before output for readability
- Menu base class handles final error display with newline prefix
- Batch operations wrap progress bar loops in try-catch to clean up on errors

**Error format pattern:**
```javascript
try {
    // Operation with progress bar
    progress.start(total, 0);
    // ... work ...
    progress.stop();
} catch (error) {
    progress.stop();
    console.log(''); // Newline before error
    throw error;
}
```

## Logging System

### Automatic Console Capture
All console output automatically logged to `./logs/YYYY-MM-DD.log`:
- Intercepts: console.log/error/warn/info/debug
- Log rotation: Keeps 10 most recent files
- Format: `[2025-12-31T10:30:45.123Z] [INFO] Message`
- Must call `initializeLogger('./logs', 10)` at entry points

### Usage
```javascript
const { initializeLogger, getLogger } = require('./logger');
initializeLogger('./logs', 10); // Once per entry point

console.log('Auto-logged message'); // Standard usage

// Log-only (no console output) for tracking markers
getLogger().logOnly('[MENU] Main Menu', 'info');
getLogger().logOnly('[ACTION] User action', 'info');

// Pause/resume for clean menu display
getLogger().pause();
console.log('Menu display (not logged)');
getLogger().resume();
```

## Development Workflows

### Running the Application
```bash
npm start             # Interactive CLI menu
npm run batch         # Direct batch processing (bypasses menu)
npm test              # Run Jest tests
```

### Discord Chat Exporter Integration
**Workflow:**
1. Menu: "1. Export All Direct Messages"
2. Select channel type filter (DM only / GROUP_DM only / Both)
3. Validate DCE_PATH and EXPORT_PATH
4. Batch process with typeFilter
5. Export each batch via `exportdm` command (JSON only - messages.json)

**DCE Arguments:**
- Token: `-t {AUTHORIZATION_TOKEN}`
- Output: `-o {EXPORT_PATH}/{USER_ID}/%G/%c/%C - %d/`
- Partition: `--partition 10MB`
- Media: `--media --media-dir {EXPORT_PATH}/media --reuse-media`
- Parallel: `--parallel 4 --respect-rate-limits`

**Output Structure:**
```
export/
  {USER_DISCORD_ID}/
    Direct Messages/
      {CHANNEL_ID}/
        {USERNAME} - {DATE}/
          messages.json
  media/
    {shared media files}
```

### Testing
```bash
# Test with DRY_RUN mode
echo "DRY_RUN: true" # in config.json

# Manual API testing
tests/curl command.sh  # Template for Discord API calls

# Menu navigation test
printf "1\nq\nq\n" | npm start 2>&1

# Check logs
tail -f logs/$(date +%Y-%m-%d).log
```

## Common Pitfalls

1. **Missing DRY_RUN check**: Always check before API calls
2. **Direct axios calls**: Use discord-api.js functions (includes rate limiting + retry)
3. **Hardcoded paths**: Use configManager.get() for all paths
4. **ConfigManager not initialized**: Call `await configManager.init()` before access
5. **Stale config reference**: Use `get options()` getter in menu classes, not constructor assignment
6. **Missing atomic writes**: Use writeJsonFile() for config files (prevents corruption)
7. **Incorrect channel type filtering**: Data package uses strings ("DM"), API uses numbers (1)

## Key Dependencies

**Runtime:**
- axios@^1.7.9 - Discord API HTTP client
- cli-progress@^3.12.0 - Progress bars
- dotenv@^16.4.7 - Environment variables

**Dev:**
- jest@^29.7.0 - Testing framework

**External:**
- Discord Chat Exporter - Required for DM export (user-installed)
- Discord Data Package - User's data export from Discord

## Version Management

Current: 1.6.2

**Automated Publishing:**
GitHub Action `.github/workflows/publish.yml` publishes to npm on version change:
1. Push to master with package.json version change
2. Validates version increment
3. Runs tests
4. Creates git tag (e.g., v1.6.2)
5. Publishes to npm

**Update version:**
```bash
npm version patch  # Bug fixes (1.6.2 → 1.6.3)
npm version minor  # New features (1.6.2 → 1.7.0)
npm version major  # Breaking changes (1.6.2 → 2.0.0)
git push origin master
```

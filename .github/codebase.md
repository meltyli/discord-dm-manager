# Discord DM Manager - AI Coding Agent Instructions

## Project Overview
A Node.js CLI tool for managing Discord Direct Messages at scale. Works in tandem with Discord Chat Exporter to process and batch-manage DMs from Discord data packages. The tool can reopen DMs based on message recency, allowing systematic review and archival; reopening is an explicit action (either as part of the batch-processing export flow or via the "Reset DM State" menu option).

## Architecture & Key Components

### Module Organization
Project uses modular architecture with focused files across 4 directories:

**Core Entry Points:**
- **`src/cli/menu-main.js`**: Main interactive CLI entry point with app initialization
- **`src/batch/batch-entry.js`**: Direct batch processing entry point

**API Layer:**
- **`src/discord-api.js`**: Discord API with rate limiting, retry logic, user validation
- **`src/parse-messages.js`**: Binary search message parser for recent DM extraction

**Menu System (`src/cli/`):**
- **`menu-main.js`**: Main menu orchestration, app initialization
- **`menu-config.js`**: Configuration submenu
- **`menu-api.js`**: Discord API operations submenu
- **`menu-helpers.js`**: Shared display utilities

**Batch Processing (`src/batch/`):**
- **`batch-processor.js`**: Core DM processing loops
  - `closeAllOpenDMs()`, `openBatchDMs()`, `closeBatchDMs()`
  - `processDMsInBatches()`, `processAndExportAllDMs()`
- **`batch-entry.js`**: Entry point for direct batch execution
- **`batch-state.js`**: State persistence
  - `saveBatchState()`, `loadBatchState()`, `clearBatchState()`, `hasIncompleteBatchSession()`

**Utilities (`src/lib/`):**
- **`cli-helpers.js`**: User input, prompts, progress bars, DCE export functions
  - `exportDMs()`, `runDCEExport()` - Export via exportdm command
- **`file-utils.js`**: Path validation, JSON operations, file traversal
- **`config-validators.js`**: Config path/user ID validation
- **`config-defaults.js`**: Export path defaulting logic
- **`rate-limiter.js`**: API throttling class

**Configuration & Logging:**
- **`src/config.js`**: ConfigManager singleton for `.env` and `config.json`
- **`src/logger.js`**: Automatic console capture to dated log files

### Critical Data Flow
1. Parse Discord data package → extract DM recipients from `channel.json` files
2. Close all currently open DMs (does NOT automatically reopen them — reopening is an explicit step)
3. Batch reopen DMs (default: 100 at a time) with rate limiting — performed when running the batch-processing export flow or explicitly via the "Reset DM State" menu option
4. **Manual Mode**: User reviews batch, presses key to continue, batch closed, next batch opened
5. **Automated Mode**: Export batch automatically, close batch, open next batch, repeat

## Configuration System

### Dual Configuration Pattern
The project uses **both** `.env` (secrets) and `config.json` (settings), both stored in the `/config` directory:

```javascript
// config/.env - Secrets only
AUTHORIZATION_TOKEN=your_discord_token
USER_DISCORD_ID=your_user_id

// config/config.json - Application settings
{
  "BATCH_SIZE": 30,
  "API_DELAY_MS": 100,
  "RATE_LIMIT_REQUESTS": 50,
  "RATE_LIMIT_INTERVAL_MS": 60000,
  "DRY_RUN": true  // Always verify this before API calls
}
```

**File Locations**: Configuration files are stored in `/config/` directory:
- `config/.env` - Environment variables (secrets)
- `config/config.json` - Application settings
- `config/lastopened.json` - Last opened DM user IDs
- `config/batch-state.json` - Batch processing state (auto-managed)

ID History is stored in the data package:
- `DATA_PACKAGE_FOLDER/messages/id-history.json` - Contains channel information from Discord API with three keys:
  - `originalState`: Channel objects from first capture (when closeAllOpenDMs is first run)
  - `latest`: Channel objects from most recent close operation (only type=1 DMs)
  - `uniqueChannels`: All unique channels ever seen (unique based on channel.id)
  - Each channel object contains full data from getCurrentOpenDMs API response

**Critical**: Access config via singleton: `const configManager = getConfigManager();`
- Use `configManager.get('KEY')` for config.json values
- Use `configManager.getEnv('KEY')` or `process.env.KEY` for .env values
- **Menu classes must use getter**: Always access config via `get options() { return this.configManager.config; }` to ensure live updates when config reloads

### Configuration Setup Flow
Handled by `config.js` using helpers from `config-validators.js` and `config-defaults.js`:

1. **Data Package Directory**: Validate with `validateDataPackage()` (checks `messages/` folder exists)
2. **User ID Verification**: `verifyUserId()` reads `user.json`, prompts for confirmation, handles mismatches
3. **Remaining Config**: `promptForConfigValue()` handles prompts with automatic EXPORT_PATH defaulting via `resolveExportPath()`
4. **Path Validation**: `validateConfigPaths()` checks and repairs invalid paths

### Channel Filtering
**Process only DM and GROUP_DM types** - exclude GUILD_TEXT and all other channel types in `src/parse-messages.js`.

## Discord API Patterns

### Rate Limiting Implementation
All Discord API calls go through `RateLimiter` class in `discord-api.js`:
```javascript
await rateLimiter.waitForSlot(); // Always called before axios requests
```
Default: 50 requests per 60 seconds (`RATE_LIMIT_REQUESTS`/`RATE_LIMIT_INTERVAL_MS`)

### User Validation Pattern
**Always validate users before reopening DMs** to handle deleted/invalid accounts:
- `validateUser()`: POSTs to `/users/@me/channels` to validate by attempting DM channel creation
- Returns `false` for 404 (not found), 400 (invalid ID), 403 (likely deleted)
- Logs validation failures without log level parameter (console.log doesn't support levels)
- `reopenDM()`: Returns `null` for invalid users
- Batch processing counts skipped vs processed users in summary

### DRY_RUN Mode
**Critical**: Check `configManager.get('DRY_RUN')` **BEFORE** making API calls or rate limiting:
```javascript
// CORRECT: Check DRY_RUN first to prevent all API calls
if (configManager.get('DRY_RUN')) {
    logger(`[DRY RUN] Would perform action`, 'info');
    return mockResponse;
}
await rateLimiter.waitForSlot(); // Only throttle real API calls
```

**Pattern Applied To All API Functions**:
- `reopenDM()`: DRY_RUN check before rate limiter (returns mock data)
- `closeDM()`: DRY_RUN check before rate limiter (returns early)
- `getCurrentOpenDMs()`: DRY_RUN check before rate limiter (returns empty array)
- `validateUser()`: Only called from reopenDM when not in dry run
- All menu operations check DRY_RUN before calling API functions

## Message Parsing Algorithm

### Binary Search for Recent Messages
`MessageParser` maintains a sorted stack of N most recent messages using binary insertion:
- `findInsertPosition()`: O(log n) binary search on timestamps
- `insertMessage()`: Removes oldest if at capacity, inserts in sorted order
- Processes `messages.json` from Discord data package (NDJSON format)

## Development Workflows

### Running the Application
```bash
npm start             # Interactive CLI menu (runs src/cli/menu-main.js)
npm run batch         # Direct batch processing (runs src/batch/batch-entry.js)
npm test              # Run Jest tests
```

### Testing Discord API Calls
Use `tests/curl command.sh` as template for manual API testing:
```bash
curl -X POST 'https://discord.com/api/v9/users/@me/channels' \
  -H 'Authorization: TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"recipients": ["USER_ID"]}'
```

### Exporting DMs
Discord Chat Exporter integration via `exportdm` command:
- Menu option "1. Export All Direct Messages"
- Uses DCE's `exportdm` command to export all open DMs
- Validates DCE_PATH and EXPORT_PATH before execution
- Exports in Json and HtmlDark formats
- Uses Node.js `spawn` to call DiscordChatExporter.Cli
- Shows real-time progress output from DCE
- DCE arguments: partition 10MB, media download, reuse-media, parallel 4
- Export path includes user ID: `{EXPORT_PATH}/{USER_ID}/%G/%c/%C - %d/`
- Media directory shared: `{EXPORT_PATH}/media`
- Comprehensive error handling

## Logging System

### Centralized Logger
All console output is automatically captured to log files via `src/logger.js`:
- **Automatic Capture**: Intercepts all `console.log()`, `console.error()`, `console.warn()`, `console.info()`, `console.debug()` calls
- **Log Location**: `./logs/YYYY-MM-DD.log` (filenames use local timezone, timestamps use UTC)
- **Log Rotation**: Automatically maintains maximum of 10 log files (configurable), removing oldest logs first
- **Initialization**: Must call `initializeLogger('./logs', 10)` at entry points (menu-main.js, batch-entry.js, parse-messages.js, config.js)
- **Log-Only Output**: Use `getLogger().logOnly(message, level)` to write to log without console display (used for `[MENU]` and `[ACTION]` markers)

### Usage Pattern
```javascript
const { initializeLogger, getLogger } = require('./logger');
initializeLogger('./logs', 10); // Initialize once per entry point

// All standard console calls are automatically logged
console.log('Info message');
console.error('Error message');
console.warn('Warning message');

// Log without console output (for tracking/metadata)
getLogger().logOnly('[MENU] Main Menu', 'info');
getLogger().logOnly('[ACTION] User selected option 1', 'info');
```

### Log Format
```
[2025-10-12T10:30:45.123Z] [INFO] Info message
[2025-10-12T10:30:46.456Z] [ERROR] Error message
[2025-10-12T10:30:47.789Z] [WARN] Warning message
[2025-10-12T20:11:41.172Z] [INFO] [MENU] Main Menu
[2025-10-12T20:11:45.231Z] [INFO] [ACTION] Configuration Menu Selected
```

### Testing Without Direct Execution
To test the application without running it interactively:
```bash
# Simple quit test
echo "q" | npm start 2>&1

# Navigate through menus (1=Config, 2=API, q=quit)
printf "1\nq\nq\n" | npm start 2>&1

# Multi-step navigation with timeouts
timeout 3 npm start 2>&1 | grep "pattern" || true

# Verify logging by checking log file
grep '\[MENU\]\|\[ACTION\]' logs/YYYY-MM-DD.log | tail -10
```

## Common Pitfalls

1. **Forgotten DRY_RUN check**: Always gate API calls with DRY_RUN check
2. **Direct axios without rate limiting**: All Discord API calls must use `discord-api.js` functions
3. **Missing user validation**: Call `validateUser()` before `reopenDM()` to avoid 403 errors
4. **Hardcoded paths**: Use `configManager.get()` for all paths (DATA_PACKAGE_FOLDER, EXPORT_PATH, DCE_PATH)
5. **ConfigManager not initialized**: Call `await configManager.init()` before accessing config values
6. **Cached config reference**: Menu classes must use getters for `options` property, not direct assignment in constructor, to avoid stale config references after reload

## External Dependencies

- **Discord Chat Exporter**: Required for initial DM export (not included, user-installed)
- **Discord Data Package**: User's Discord data export containing `messages/` folder with `channel.json` and `messages.json` files
- **axios**: HTTP client for Discord API (v9)
- **cli-progress**: Progress bars for batch operations
- **dotenv**: Environment variable management

## Testing Approach

- Jest configured but minimal tests currently
- Manual testing workflow: Set `DRY_RUN: true`, verify logs, then set `false`
- Use `tests/curl command.sh` for API endpoint verification
- **Dry run throttling test**: Run `node test-dry-run-throttle.js` to verify DRY_RUN mode skips rate limiting (should complete in <1ms for 10 operations)

## Publishing & Release

### Automated NPM Publishing
GitHub Action (`.github/workflows/publish.yml`) automatically publishes to npm when version changes:
- Triggers on push to `master` with `package.json` changes
- Validates version increment (skips if unchanged)
- Runs tests before publishing
- Creates git tag for release (e.g., `v1.5.0`)
- Requires `NPM_TOKEN` secret in GitHub repository settings

### Version Management
Update version in `package.json` using semver pattern `X.Y.Z`:
- **X (MAJOR)**: Breaking changes
- **Y (MINOR)**: New features, backward compatible
- **Z (PATCH)**: Bug fixes, backward compatible

Use `npm version` or manually edit:
```bash
npm version patch  # 1.5.0 → 1.5.1
npm version minor  # 1.5.0 → 1.6.0
npm version major  # 1.5.0 → 2.0.0
git push origin master  # Triggers publish workflow
```

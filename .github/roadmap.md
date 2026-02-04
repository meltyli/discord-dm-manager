# Roadmap

## Current Status

### ✅ Completed Features

#### Session 7: id-history.json Revamp
- Stores full channel objects from getCurrentOpenDMs
- Three-key structure: `originalState`, `latest`, `uniqueChannels`
- Simplified channel data to essential fields only

#### Export Status Tracking
- `exportStatus` field in id-history.json tracks per-channel export completion
- Status values: `pending`, `in-progress`, `completed`, `failed`
- Resume capability skips already-completed exports
- Completion count displayed before starting new exports

#### Basic Batch State
- `batch-state.json` exists with schema: `allDmIds`, `totalBatches`, `currentBatch`, `processedUsers`, `skippedUsers`, `timestamp`, `inProgress`
- Atomic writes implemented in `writeJsonFile()` (temp file → rename)
- `hasIncompleteBatchSession()` checks for recent incomplete sessions (within 7 days)
- State cleared on completion

#### Export Infrastructure
- JSON-only export format (hardcoded)
- DCE integration with media download, reuse, and partitioning
- Automatic retry logic (2 attempts with progressive delays)
- Enhanced error extraction from DCE output
- Progress bars with username display
- Batch size default: 20
- Type filtering: DM only (type=1), GROUP_DM excluded

#### Docker & Environment
- Docker Compose v2 syntax throughout
- UID/GID environment variables for host user permissions
- Automatic architecture detection for DCE download
- Pre-configured paths for Docker environment

## 🚧 Pending Implementation

### High Priority

All high-priority items have been completed.

### Medium Priority

#### Comprehensive Testing
✅ **Completed** - Unit tests exist in test-batch-resume.js with comprehensive coverage for:
- Save/load batch state
- Mark batch completion
- Resume from incomplete session
- Clear batch state on completion
- Atomic write verification

### Low Priority (Code Quality)

#### Completed:
1. ✅ Refactored duplicate error handling in cli-helpers.js
2. ✅ Updated docker-compose → docker compose across codebase
3. ✅ Removed obsolete `version: '3.8'` from docker-compose.yml
4. ✅ Added UID/GID documentation
5. ✅ Extracted magic numbers to named constants:
   - BATCH_STATE_MAX_AGE_MS (7 days)
   - MAX_OUTPUT_SUMMARY_CHARS, ERROR_CONTEXT_START_CHARS, ERROR_CONTEXT_END_CHARS
   - EXPORT_TIMEOUT_MS, RETRY_DELAY_BASE_MS
   - LONG_PAUSE_MIN_MS, LONG_PAUSE_MAX_MS, etc. (rate-limiter.js)
   - DEFAULT_RATE_LIMIT_RETRY_MS (discord-api.js)
6. ✅ Renamed `API_DELAY_MS` to `INTER_BATCH_DELAY_MS` with automatic migration
7. ✅ Removed redundant path validation in config.js:
   - Consolidated validateDataPackageFolder() logic into validatePaths()
   - Eliminated duplicate validatePathExists() calls
   - Extracted setup instructions into showDataPackageSetupInstructions()
8. ✅ Simplified progress bar creation logic:
   - Removed inline cliProgress.SingleBar creation in exportChannelsInParallel
   - Now consistently uses createDMProgressBar helper throughout codebase

#### Pending Review:
9. Consolidate readline cleanup patterns
10. DRY out menu option handling

## Implementation Notes

### Resume Implementation Plan
When implementing resume (Sessions 1-3):
- Add `lastCompletedBatch` to batch state schema
- Update after export + close completes for each batch
- Resume menu option loads state and validates paths
- Start processing at `lastCompletedBatch + 1`
- Skip batches <= `lastCompletedBatch`

### Batch Size Recommendations
- Recommended: < 40 DMs per batch
- Reason: Reduces risk of long-running batches failing
- Implementation: Prompt confirmation when user sets > 40

### Export Status vs Batch Resume
- **Export Status** (✅ implemented): Per-channel tracking in id-history.json
- **Batch Resume** (❌ not implemented): Per-batch tracking in batch-state.json
- These work together: Export status provides fine-grained resume within a batch

## Acceptance Criteria Summary

### For Batch Resume Feature:
- [x] `lastCompletedBatch` field in batch-state.json
- [x] Atomic writes to batch state after each batch
- [x] "Resume previous export" menu option
- [x] Resume flow validates paths and starts at correct batch
- [x] Interrupted runs leave valid state
- [x] Completed runs clear state
- [x] Tests verify no re-run of completed batches
- [x] Warning displayed when batch size > 40

All acceptance criteria have been met.

#file:guidelines.instructions.md

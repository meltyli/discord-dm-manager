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

#### Session 1-3: Reliable Batch Resume
**Missing:**
- `lastCompletedBatch` field in batch-state.json schema
- Per-batch completion tracking
- "Resume previous export" menu option
- Resume flow that starts from `lastCompletedBatch + 1`
- Validation of EXPORT_PATH and DCE_PATH before resuming

**Current Limitation:**
- Exports can be resumed at channel level (via exportStatus)
- But batch-level resume not implemented
- Interrupted exports must restart entire batch

#### Session 5: Batch Size Warning
- Missing: Warning when batch size > 40
- Missing: Confirmation prompt for large batch sizes
- Current: User can set any batch size without warning

#### Session 6: Sub-menu Rearrangement
- Missing: Menu option 2 visibility before configuration
- Current: Some options may require configuration before display

### Medium Priority

#### Comprehensive Testing
- Unit tests for save/load batch state needed
- E2E test for crash/resume scenario needed
- Batch processor tests exist but incomplete coverage

### Low Priority (Code Quality)

#### Completed:
1. ✅ Refactored duplicate error handling in cli-helpers.js
2. ✅ Updated docker-compose → docker compose across codebase
3. ✅ Removed obsolete `version: '3.8'` from docker-compose.yml
4. ✅ Added UID/GID documentation

#### Pending Review:
5. Remove redundant path validation in config.js
6. Simplify progress bar creation logic
7. Extract magic numbers to named constants
8. Consolidate readline cleanup patterns
9. DRY out menu option handling
10. Remove unused/deprecated `API_DELAY_MS` config

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
- [ ] `lastCompletedBatch` field in batch-state.json
- [ ] Atomic writes to batch state after each batch
- [ ] "Resume previous export" menu option
- [ ] Resume flow validates paths and starts at correct batch
- [ ] Interrupted runs leave valid state
- [ ] Completed runs clear state
- [ ] Tests verify no re-run of completed batches
- [ ] Warning displayed when batch size > 40

#file:guidelines.instructions.md

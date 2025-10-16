# Roadmap: Reliable Batch Resume for Export All Direct Messages

Goal: Implement reliable resume behavior for the Export All Direct Messages workflow, add a per-batch completion flag, and reduce risk of long-running batches. Recommend keeping batch size under 40; warn when user selects >40.

## Sessions

### Session 1 — State schema & save/load
- Add `lastCompletedBatch` (integer) to `config/batch-state.json`.
- Ensure `saveBatchState()` writes:
  - allDmIds, totalBatches, currentBatch, processedUsers, skippedUsers, timestamp, inProgress, lastCompletedBatch
- Implement atomic write (write temp file, rename) for batch-state using `writeJsonFileAtomic`.

Acceptance:
- Batch state schema updated and file written atomically after each batch completes.

### Session 2 — Marking per-batch completion
- After finishing export + close for a batch, set `lastCompletedBatch = batchNum` and persist state.
- Ensure `currentBatch` advances only after marking completion.

Acceptance:
- Resumable state shows highest fully completed batch; partial batches are not marked complete.

### Session 3 — Resume flow & menu
- Add "Resume previous export" menu option.
- On resume:
  - Load and validate `batch-state.json` fields.
  - Restore `allDmIds`, `totalBatches`, `currentBatch`, `processedUsers`, `skippedUsers`.
  - Start processing at `lastCompletedBatch + 1`.
- Validate EXPORT_PATH and DCE_PATH before resuming.

Acceptance:
- User can select resume; processing continues from the next uncompleted batch.

### Session 4 — Robustness & cleanup
- Use `inProgress` flag: set true when run starts, false on clean completion.
- On clean completion, clear or archive `batch-state.json`.

Acceptance:
- Interrupted runs leave valid state; completed runs clear state.

### Session 5 — Tests, logging, and UX
- Unit tests for save/load state and resume logic.
- End-to-end test: start run, simulate crash after N batches, resume and verify no re-run of completed batches.
- Add user prompt when starting export that warns: "Recommended batch size < 40. Proceed with batch size > 40? (y/n)".

Acceptance:
- Tests pass, logs indicate resume points, user warned on large batch sizes.

## Implementation notes
- Use `lastCompletedBatch` as the minimal per-batch completion flag (simpler to implement and reason about).
- On resume, skip batches <= `lastCompletedBatch`.
- Persist state immediately after each batch completes to make resume reliable.
- Recommend batch size under 40; if configured batch size > 40 show a clear warning and require confirmation.
- Discord Chat Exporter creates unique folders based on time, so no need to check for existing exports.

## Minimal acceptance criteria for feature delivery
- New menu option to resume works and resumes from the next uncompleted batch.
- Batch-state schema includes per-batch completion tracking.
- State file writes are atomic and updated after each batch.
- User receives a warning when batch size > 40.

### Session 6 - Sub menu rearrangement
- Don't hide menu option 2 and instead prompt the user the menu option they need to use before it's available

### Session 7 Revamp id-history.json output
✅ Completed - id-history.json now stores full channel objects from getCurrentOpenDMs with three keys:
- `originalState`: Channel data from first capture
- `latest`: Channel data from most recent close operation (type=1 DMs only)
- `uniqueChannels`: All unique channels ever seen (by channel.id)

#file:guidelines.instructions.md 
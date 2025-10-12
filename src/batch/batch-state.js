const fs = require('fs');
const { resolveConfigPath, readJsonFile, writeJsonFile } = require('../lib/file-utils');

/**
 * Save batch processing state to file
 * @param {Object} state - Batch state object
 */
function saveBatchState(state) {
    try {
        const filePath = resolveConfigPath('batch-state.json');
        writeJsonFile(filePath, state);
        console.log(`Saved batch state: batch ${state.currentBatch}/${state.totalBatches}`);
    } catch (error) {
        console.error(`Failed to save batch state: ${error.message}`);
    }
}

/**
 * Load batch processing state from file
 * @returns {Object|null} Batch state object or null if not found
 */
function loadBatchState() {
    try {
        const filePath = resolveConfigPath('batch-state.json');
        return readJsonFile(filePath);
    } catch (error) {
        console.error(`Failed to load batch state: ${error.message}`);
        return null;
    }
}

/**
 * Clear batch processing state file
 */
function clearBatchState() {
    try {
        const filePath = resolveConfigPath('batch-state.json');
        fs.unlinkSync(filePath);
        console.log('Cleared batch state');
    } catch (error) {
        // File may not exist, which is fine
        if (error.code !== 'ENOENT') {
            console.error(`Failed to clear batch state: ${error.message}`);
        }
    }
}

/**
 * Check if there's an incomplete batch session (within 7 days)
 * @returns {boolean} True if incomplete session exists
 */
function hasIncompleteBatchSession() {
    const state = loadBatchState();
    if (!state) return false;
    
    // Check if state is recent (within 7 days)
    const stateAge = Date.now() - new Date(state.timestamp).getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    
    return state.inProgress && stateAge < sevenDays;
}

module.exports = {
    saveBatchState,
    loadBatchState,
    clearBatchState,
    hasIncompleteBatchSession
};

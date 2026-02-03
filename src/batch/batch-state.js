const fs = require('fs');
const { resolveConfigPath, readJsonFile, writeJsonFile } = require('../lib/file-utils');

function saveBatchState(state) {
    try {
        const filePath = resolveConfigPath('batch-state.json');
        // Ensure lastCompletedBatch exists in state
        if (state.lastCompletedBatch === undefined) {
            state.lastCompletedBatch = -1;
        }
        // writeJsonFile already implements atomic writes (temp file + rename)
        writeJsonFile(filePath, state);
        console.log(`Saved batch state: batch ${state.currentBatch}/${state.totalBatches}`);
    } catch (error) {
        console.error(`Failed to save batch state: ${error.message}`);
    }
}

function loadBatchState() {
    try {
        const filePath = resolveConfigPath('batch-state.json');
        return readJsonFile(filePath);
    } catch (error) {
        console.error(`Failed to load batch state: ${error.message}`);
        return null;
    }
}

function clearBatchState() {
    try {
        const filePath = resolveConfigPath('batch-state.json');
        fs.unlinkSync(filePath);
        console.log('Cleared batch state');
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error(`Failed to clear batch state: ${error.message}`);
        }
    }
}

function hasIncompleteBatchSession() {
    const state = loadBatchState();
    if (!state) return false;
    
    // Check if state is recent (within 7 days)
    const stateAge = Date.now() - new Date(state.timestamp).getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    
    return state.inProgress && stateAge < sevenDays;
}

function validateBatchStateForResume(state, configManager) {
    if (!state) {
        throw new Error('No batch state found');
    }
    
    if (!state.inProgress) {
        throw new Error('Batch session is not in progress');
    }
    
    if (state.lastCompletedBatch === undefined) {
        throw new Error('Batch state is missing lastCompletedBatch field');
    }
    
    if (state.lastCompletedBatch >= state.totalBatches) {
        throw new Error('All batches already completed');
    }
    
    // Check if state is recent (within 7 days)
    const stateAge = Date.now() - new Date(state.timestamp).getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    
    if (stateAge >= sevenDays) {
        throw new Error('Batch state is too old (>7 days)');
    }
    
    return true;
}

module.exports = {
    saveBatchState,
    loadBatchState,
    clearBatchState,
    hasIncompleteBatchSession,
    validateBatchStateForResume
};

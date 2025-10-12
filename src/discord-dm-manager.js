require('dotenv').config();
const { initializeLogger } = require('./logger');
const { traverseDataPackage, getRecipients } = require('./lib/file-utils');
const { 
    closeAllOpenDMs, 
    openBatchDMs, 
    closeBatchDMs, 
    saveOpenDMsToFile, 
    processDMsInBatches, 
    processAndExportAllDMs 
} = require('./batch/batch-processor');
const { 
    saveBatchState, 
    loadBatchState, 
    clearBatchState, 
    hasIncompleteBatchSession 
} = require('./batch/batch-state');

// Initialize logger to capture all console output
initializeLogger('./logs', 10);


// Re-export all functions for backwards compatibility
module.exports = {
    processDMsInBatches,
    processAndExportAllDMs,
    closeAllOpenDMs,
    openBatchDMs,
    closeBatchDMs,
    traverseDataPackage,
    getRecipients,
    saveOpenDMsToFile,
    saveBatchState,
    loadBatchState,
    clearBatchState,
    hasIncompleteBatchSession
};

// Only run if this file is executed directly (not imported)
if (require.main === module) {
    processDMsInBatches().catch(error => {
        console.error(`Error in main process: ${error.stack}`);
        process.exit(1);
    });
}

const { initializeLogger } = require('../logger');
const { processDMsInBatches } = require('./batch-processor');

// Initialize logger to capture all console output
initializeLogger('./logs', 10);

// Run batch processing
processDMsInBatches().catch(error => {
    console.error(`Error in main process: ${error.stack}`);
    process.exit(1);
});

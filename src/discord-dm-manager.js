require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const cliProgress = require('cli-progress');
const { initializeLogger } = require('./logger');
const { getConfigManager } = require('./config');
const { getCurrentOpenDMs, reopenDM, closeDM, delay } = require('./discord-api');
const { traverseDataPackage, getRecipients } = require('./lib/file-utils');
const configManager = getConfigManager();

// Initialize logger to capture all console output
initializeLogger('./logs', 10);

const LogLevels = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3
};

function logOutput(message, level = 'info') {
    if (LogLevels[level] <= LogLevels[configManager.get('LOG_LEVEL')]) {
        // Use console directly - it will be intercepted by logger
        const levelMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
        console[levelMethod](message);
    }
}

async function waitForKeyPress(rlInterface = null) {
    logOutput('Press any key to continue...', 'info');
    
    if (rlInterface) {
        // Use provided readline interface
        return new Promise(resolve => {
            rlInterface.question('', () => {
                resolve();
            });
        });
    } else {
        // Create temporary interface (for standalone execution)
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        return new Promise(resolve => {
            rl.question('', () => {
                rl.close();
                resolve();
            });
        });
    }
}

// Progress tracking
function createProgressBar() {
    return new cliProgress.SingleBar({
        format: 'Progress |{bar}| {percentage}% || {value}/{total} DMs',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591'
    });
}

// Close all currently open DMs and save their IDs
async function closeAllOpenDMs() {
    try {
        if (configManager.get('DRY_RUN')) {
            logOutput('[DRY RUN] Would close all open DMs and save IDs to closedIDs.json', 'info');
            return [];
        }

        logOutput('Fetching all currently open DMs...', 'info');
        const currentDMs = await getCurrentOpenDMs(configManager.getEnv('AUTHORIZATION_TOKEN'), logOutput);
        
        if (currentDMs.length === 0) {
            logOutput('No open DMs to close.', 'info');
            return [];
        }

        logOutput(`Found ${currentDMs.length} open DMs. Closing...`, 'info');
        
        // Prepare config directory and file path
        const configDir = path.join(process.cwd(), 'config');
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        const filePath = path.join(configDir, 'closedIDs.json');
        
        // Load existing data structure or initialize
        let data = { current: [], all: [] };
        if (fs.existsSync(filePath)) {
            try {
                const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                // Handle legacy format (plain array)
                if (Array.isArray(existing)) {
                    data.all = existing;
                } else {
                    data = existing;
                }
            } catch (error) {
                logOutput(`Could not parse existing closedIDs.json, starting fresh: ${error.message}`, 'warn');
            }
        }
        
        // Reset current array for this operation
        data.current = [];
        
        const closeProgress = createProgressBar();
        closeProgress.start(currentDMs.length, 0);
        
        for (const [index, dm] of currentDMs.entries()) {
            if (dm.type === 1 && dm.recipients && dm.recipients.length > 0) {
                const recipient = dm.recipients[0];
                
                await closeDM(configManager.getEnv('AUTHORIZATION_TOKEN'), dm.id, logOutput);
                await delay(configManager.get('API_DELAY_MS'));
                
                // Add to current array
                data.current.push(recipient.id);
                
                // Add to all array only if not already present (maintain order)
                if (!data.all.includes(recipient.id)) {
                    data.all.push(recipient.id);
                }
                
                // Save after each close
                fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
            }
            closeProgress.update(index + 1);
        }
        closeProgress.stop();
        
        logOutput(`\nSuccessfully closed ${data.current.length} DMs. User IDs saved to ${filePath}`, 'info');
        logOutput(`Total unique IDs in history: ${data.all.length}`, 'info');
        
        return data.current;
    } catch (error) {
        logOutput(`Failed to close all open DMs: ${error.message}`, 'error');
        throw error;
    }
}

// Open a batch of DMs
async function openBatchDMs(userIds, batchNum, totalBatches) {
    if (configManager.get('DRY_RUN')) {
        logOutput(`[DRY RUN] Would open batch ${batchNum + 1}/${totalBatches} with ${userIds.length} DMs`, 'info');
        return { processed: userIds.length, skipped: 0 };
    }

    logOutput(`Opening batch ${batchNum + 1}/${totalBatches} (${userIds.length} DMs)...`, 'info');
    
    const batchProgress = createProgressBar();
    batchProgress.start(userIds.length, 0);
    
    let skippedUsers = 0;
    let processedUsers = 0;
    
    for (const [index, userId] of userIds.entries()) {
        const result = await reopenDM(configManager.getEnv('AUTHORIZATION_TOKEN'), userId, logOutput);
        if (result === null) {
            skippedUsers++;
        } else {
            processedUsers++;
        }
        await delay(configManager.get('API_DELAY_MS'));
        batchProgress.update(index + 1);
    }
    batchProgress.stop();
    
    return { processed: processedUsers, skipped: skippedUsers };
}

// Close current batch of DMs
async function closeBatchDMs() {
    if (configManager.get('DRY_RUN')) {
        logOutput('[DRY RUN] Would close current batch DMs', 'info');
        return;
    }

    logOutput('Closing current batch DMs...', 'info');
    const batchDMs = await getCurrentOpenDMs(configManager.getEnv('AUTHORIZATION_TOKEN'), logOutput);
    
    for (const dm of batchDMs) {
        if (dm.type === 1) {
            await closeDM(configManager.getEnv('AUTHORIZATION_TOKEN'), dm.id, logOutput);
            await delay(configManager.get('API_DELAY_MS'));
        }
    }
    logOutput(`Closed ${batchDMs.length} batch DMs`, 'info');
}

// Add this new function to save open DMs to a file
async function saveOpenDMsToFile() {
    try {
        const openDMs = await getCurrentOpenDMs(configManager.getEnv('AUTHORIZATION_TOKEN'), logOutput);
        
        // Extract IDs of recipients (users) from DM channels
        const userIds = openDMs
            .filter(dm => dm.type === 1) // Filter for DM channels only
            .map(dm => dm.recipients && dm.recipients.length > 0 ? dm.recipients[0].id : null)
            .filter(id => id !== null);
        
        // Create config directory if it doesn't exist
        const configDir = path.join(process.cwd(), 'config');
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        
        // Save to JSON file
        const filePath = path.join(configDir, 'lastopened.json');
        fs.writeFileSync(filePath, JSON.stringify(userIds, null, 2));
        
        logOutput(`Saved ${userIds.length} open DM user IDs to ${filePath}`, 'info');
        return userIds;
    } catch (error) {
        logOutput(`Failed to save open DMs: ${error.message}`, 'error');
        throw error;
    }
}

// Save batch processing state
function saveBatchState(state) {
    try {
        const configDir = path.join(process.cwd(), 'config');
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        
        const filePath = path.join(configDir, 'batch-state.json');
        fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
        logOutput(`Saved batch state: batch ${state.currentBatch}/${state.totalBatches}`, 'debug');
    } catch (error) {
        logOutput(`Failed to save batch state: ${error.message}`, 'error');
    }
}

// Load batch processing state
function loadBatchState() {
    try {
        const configDir = path.join(process.cwd(), 'config');
        const filePath = path.join(configDir, 'batch-state.json');
        
        if (!fs.existsSync(filePath)) {
            return null;
        }
        
        const state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return state;
    } catch (error) {
        logOutput(`Failed to load batch state: ${error.message}`, 'error');
        return null;
    }
}

// Clear batch processing state
function clearBatchState() {
    try {
        const configDir = path.join(process.cwd(), 'config');
        const filePath = path.join(configDir, 'batch-state.json');
        
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            logOutput('Cleared batch state', 'debug');
        }
    } catch (error) {
        logOutput(`Failed to clear batch state: ${error.message}`, 'error');
    }
}

// Check if there's an incomplete batch session
function hasIncompleteBatchSession() {
    const state = loadBatchState();
    if (!state) return false;
    
    // Check if state is recent (within 7 days)
    const stateAge = Date.now() - new Date(state.timestamp).getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    
    return state.inProgress && stateAge < sevenDays;
}

// Main processing function (legacy - kept for backwards compatibility)
async function processDMsInBatches(startBatch = 0, rlInterface = null) {
    logOutput('Starting DM processing...', 'info');

    try {
        await configManager.init();

        const channelJsonPaths = traverseDataPackage(configManager.get('DATA_PACKAGE_FOLDER'));
        const allDmIds = getRecipients(channelJsonPaths, configManager.getEnv('USER_DISCORD_ID'));

        if (allDmIds.length === 0) {
            logOutput('No DM recipients found. Please check your Discord ID and data package path.', 'warn');
            return;
        }

        if (configManager.get('DRY_RUN')) {
            logOutput('Running in DRY RUN mode - no actual API calls will be made', 'info');
            logOutput(`Would process ${allDmIds.length} DM recipients`, 'info');
            return;
        }

        // Close all currently open DMs
        await closeAllOpenDMs();

        const totalBatches = Math.ceil(allDmIds.length / configManager.get('BATCH_SIZE'));
        logOutput(`Processing ${allDmIds.length} DMs in ${totalBatches} batches of ${configManager.get('BATCH_SIZE')}`, 'info');
        
        if (startBatch > 0) {
            logOutput(`Resuming from batch ${startBatch + 1}/${totalBatches}`, 'info');
        }
        
        let skippedUsers = 0;
        let processedUsers = 0;
        
        // Initialize batch state
        const batchState = {
            allDmIds: allDmIds,
            totalBatches: totalBatches,
            currentBatch: startBatch,
            processedUsers: 0,
            skippedUsers: 0,
            timestamp: new Date().toISOString(),
            inProgress: true
        };
        saveBatchState(batchState);
        
        for (let batchNum = startBatch; batchNum < totalBatches; batchNum++) {
            const startIdx = batchNum * configManager.get('BATCH_SIZE');
            const endIdx = Math.min((batchNum + 1) * configManager.get('BATCH_SIZE'), allDmIds.length);
            const currentBatch = allDmIds.slice(startIdx, endIdx);

            // Open batch
            const stats = await openBatchDMs(currentBatch, batchNum, totalBatches);
            processedUsers += stats.processed;
            skippedUsers += stats.skipped;

            // Update state after completing batch
            batchState.currentBatch = batchNum + 1;
            batchState.processedUsers = processedUsers;
            batchState.skippedUsers = skippedUsers;
            batchState.timestamp = new Date().toISOString();
            saveBatchState(batchState);

            if (!configManager.get('DRY_RUN')) {
                logOutput('\nBatch complete. Please review these DMs.', 'info');
                await waitForKeyPress(rlInterface);

                await closeBatchDMs();
            }
        }

        logOutput(`\nProcessing complete!`, 'info');
        logOutput(`Processed users: ${processedUsers}`, 'info');
        logOutput(`Skipped users: ${skippedUsers}`, 'info');
        
        // Mark as complete and clear state
        batchState.inProgress = false;
        saveBatchState(batchState);
        clearBatchState();
    } catch (error) {
        logOutput(`Fatal error in main process: ${error.message}`, 'error');
        throw error;
    }
}

// Process all DMs with automatic export after each batch
async function processAndExportAllDMs(exportCallback, rlInterface = null) {
    logOutput('Starting DM processing with automatic exports...', 'info');

    try {
        await configManager.init();

        const channelJsonPaths = traverseDataPackage(configManager.get('DATA_PACKAGE_FOLDER'));
        const allDmIds = getRecipients(channelJsonPaths, configManager.getEnv('USER_DISCORD_ID'));

        if (allDmIds.length === 0) {
            logOutput('No DM recipients found. Please check your Discord ID and data package path.', 'warn');
            return;
        }

        if (configManager.get('DRY_RUN')) {
            logOutput('Running in DRY RUN mode - no actual API calls will be made', 'info');
            logOutput(`Would process ${allDmIds.length} DM recipients`, 'info');
            return;
        }

        // Step 1: Close all currently open DMs
        await closeAllOpenDMs();

        const totalBatches = Math.ceil(allDmIds.length / configManager.get('BATCH_SIZE'));
        logOutput(`Processing ${allDmIds.length} DMs in ${totalBatches} batches of ${configManager.get('BATCH_SIZE')}`, 'info');
        logOutput('Each batch will be automatically exported before moving to the next.', 'info');
        
        let skippedUsers = 0;
        let processedUsers = 0;
        
        // Initialize batch state
        const batchState = {
            allDmIds: allDmIds,
            totalBatches: totalBatches,
            currentBatch: 0,
            processedUsers: 0,
            skippedUsers: 0,
            timestamp: new Date().toISOString(),
            inProgress: true
        };
        saveBatchState(batchState);
        
        for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
            const startIdx = batchNum * configManager.get('BATCH_SIZE');
            const endIdx = Math.min((batchNum + 1) * configManager.get('BATCH_SIZE'), allDmIds.length);
            const currentBatch = allDmIds.slice(startIdx, endIdx);

            // Step 2: Open batch
            const stats = await openBatchDMs(currentBatch, batchNum, totalBatches);
            processedUsers += stats.processed;
            skippedUsers += stats.skipped;

            // Update state after completing batch
            batchState.currentBatch = batchNum + 1;
            batchState.processedUsers = processedUsers;
            batchState.skippedUsers = skippedUsers;
            batchState.timestamp = new Date().toISOString();
            saveBatchState(batchState);

            // Step 3: Export the batch
            logOutput('\nExporting current batch...', 'info');
            try {
                await exportCallback();
                logOutput('Export completed successfully.', 'info');
            } catch (error) {
                logOutput(`Export failed: ${error.message}`, 'error');
                const continueAnyway = await new Promise(resolve => {
                    if (rlInterface) {
                        rlInterface.question('Continue with next batch anyway? (y/n): ', answer => {
                            resolve(answer.toLowerCase() === 'y');
                        });
                    } else {
                        resolve(false);
                    }
                });
                
                if (!continueAnyway) {
                    logOutput('Processing stopped by user.', 'info');
                    return;
                }
            }

            // Step 4: Close batch DMs
            await closeBatchDMs();
            
            // Small delay before next batch
            if (batchNum < totalBatches - 1) {
                logOutput(`Batch ${batchNum + 1}/${totalBatches} complete. Moving to next batch...`, 'info');
                await delay(configManager.get('API_DELAY_MS') * 2);
            }
        }

        logOutput(`\nAll batches processed and exported!`, 'info');
        logOutput(`Total processed users: ${processedUsers}`, 'info');
        logOutput(`Total skipped users: ${skippedUsers}`, 'info');
        
        // Mark as complete and clear state
        batchState.inProgress = false;
        saveBatchState(batchState);
        clearBatchState();
    } catch (error) {
        logOutput(`Fatal error in main process: ${error.message}`, 'error');
        throw error;
    }
}

module.exports = {
    processDMsInBatches,
    processAndExportAllDMs,
    closeAllOpenDMs,
    openBatchDMs,
    closeBatchDMs,
    traverseDataPackage,
    getRecipients,
    saveOpenDMsToFile,
    loadBatchState,
    clearBatchState,
    hasIncompleteBatchSession
};

// Only run if this file is executed directly (not imported)
if (require.main === module) {
    processDMsInBatches().catch(error => {
        logOutput(`Error in main process: ${error.stack}`, 'error');
        process.exit(1);
    });
}

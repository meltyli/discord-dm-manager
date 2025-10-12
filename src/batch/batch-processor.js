const path = require('path');
const { getConfigManager } = require('../config');
const { getCurrentOpenDMs, reopenDM, closeDM, delay } = require('../discord-api');
const { traverseDataPackage, getRecipients, resolveConfigPath, readJsonFile, writeJsonFile } = require('../lib/file-utils');
const { waitForKeyPress, promptConfirmation, createDMProgressBar } = require('../lib/cli-helpers');
const { saveBatchState, loadBatchState, clearBatchState } = require('./batch-state');

const configManager = getConfigManager();

/**
 * Close all currently open DMs and save their IDs
 * @returns {Promise<string[]>} Array of closed DM user IDs
 */
async function closeAllOpenDMs() {
    try {
        if (configManager.get('DRY_RUN')) {
            console.log('[DRY RUN] Would close all open direct messages and save IDs to id-history.json');
            return [];
        }

        const currentDMs = await getCurrentOpenDMs(configManager.getEnv('AUTHORIZATION_TOKEN'));
        
        if (currentDMs.length === 0) {
            console.log('No open direct messages to close.');
            return [];
        }

        console.log(`Closing ${currentDMs.length} open direct messages...`);
        
        // Prepare file path
        const dataPackagePath = configManager.get('DATA_PACKAGE_FOLDER');
        const filePath = path.join(dataPackagePath, 'messages', 'id-history.json');
        
        // Load existing data structure or initialize
        let data = { latest: [], uniqueIds: [] };
        const existing = readJsonFile(filePath);
        if (existing) {
            // Handle legacy format (plain array or old property names)
            if (Array.isArray(existing)) {
                data.uniqueIds = existing;
            } else if (existing.current || existing.all) {
                // Handle old property names
                data.latest = existing.current || [];
                data.uniqueIds = existing.all || [];
            } else {
                data = existing;
            }
        }
        
        // Reset latest array for this operation
        data.latest = [];
        
        const closeProgress = createDMProgressBar();
        closeProgress.start(currentDMs.length, 0);
        
        for (const [index, dm] of currentDMs.entries()) {
            if (dm.type === 1 && dm.recipients && dm.recipients.length > 0) {
                const recipient = dm.recipients[0];
                
                await closeDM(configManager.getEnv('AUTHORIZATION_TOKEN'), dm.id);
                await delay(configManager.get('API_DELAY_MS'));
                
                // Add to latest array
                data.latest.push(recipient.id);
                
                // Add to uniqueIds array only if not already present (maintain order)
                if (!data.uniqueIds.includes(recipient.id)) {
                    data.uniqueIds.push(recipient.id);
                }
                
                // Save after each close
                writeJsonFile(filePath, data);
            }
            closeProgress.update(index + 1);
        }
        closeProgress.stop();
        
        console.log(`Successfully closed ${data.latest.length} direct messages. User IDs saved to ${filePath}`);
        console.log(`Total unique IDs in history: ${data.uniqueIds.length}`);
        
        return data.latest;
    } catch (error) {
        console.error(`Failed to close all open direct messages: ${error.message}`);
        throw error;
    }
}

/**
 * Open a batch of DMs
 * @param {string[]} userIds - Array of user IDs to open DMs with
 * @param {number} batchNum - Current batch number (0-indexed)
 * @param {number} totalBatches - Total number of batches
 * @returns {Promise<Object>} Statistics object with processed and skipped counts
 */
async function openBatchDMs(userIds, batchNum, totalBatches) {
    if (configManager.get('DRY_RUN')) {
        console.log(`[DRY RUN] Would open batch ${batchNum + 1}/${totalBatches} with ${userIds.length} direct messages`);
        return { processed: userIds.length, skipped: 0 };
    }

    console.log(`Opening batch ${batchNum + 1}/${totalBatches} (${userIds.length} direct messages)...`);
    
    const batchProgress = createDMProgressBar();
    batchProgress.start(userIds.length, 0);
    
    let skippedUsers = 0;
    let processedUsers = 0;
    
    for (const [index, userId] of userIds.entries()) {
        const result = await reopenDM(configManager.getEnv('AUTHORIZATION_TOKEN'), userId);
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

/**
 * Close current batch of DMs
 * @returns {Promise<void>}
 */
async function closeBatchDMs() {
    if (configManager.get('DRY_RUN')) {
        console.log('[DRY RUN] Would close current batch direct messages');
        return;
    }

    console.log('Closing current batch direct messages...');
    const batchDMs = await getCurrentOpenDMs(configManager.getEnv('AUTHORIZATION_TOKEN'));
    
    for (const dm of batchDMs) {
        if (dm.type === 1) {
            await closeDM(configManager.getEnv('AUTHORIZATION_TOKEN'), dm.id);
            await delay(configManager.get('API_DELAY_MS'));
        }
    }
    console.log(`Closed ${batchDMs.length} batch direct messages`);
}

/**
 * Save currently open DMs to file
 * @returns {Promise<string[]>} Array of open DM user IDs
 */
async function saveOpenDMsToFile() {
    try {
        const openDMs = await getCurrentOpenDMs(configManager.getEnv('AUTHORIZATION_TOKEN'));
        
        // Extract IDs of recipients (users) from DM channels
        const userIds = openDMs
            .filter(dm => dm.type === 1) // Filter for DM channels only
            .map(dm => dm.recipients && dm.recipients.length > 0 ? dm.recipients[0].id : null)
            .filter(id => id !== null);
        
        // Save to JSON file
        const filePath = resolveConfigPath('lastopened.json');
        writeJsonFile(filePath, userIds);
        
        console.log(`Saved ${userIds.length} open direct message user IDs to ${filePath}`);
        return userIds;
    } catch (error) {
        console.error(`Failed to save open direct messages: ${error.message}`);
        throw error;
    }
}

/**
 * Main processing function - processes DMs in batches with manual review
 * @param {number} startBatch - Batch number to start from (0-indexed)
 * @param {readline.Interface} rlInterface - Readline interface for user input
 * @returns {Promise<void>}
 */
async function processDMsInBatches(startBatch = 0, rlInterface = null) {
    try {
        await configManager.init();

        const channelJsonPaths = traverseDataPackage(configManager.get('DATA_PACKAGE_FOLDER'));
        const allDmIds = getRecipients(channelJsonPaths, configManager.getEnv('USER_DISCORD_ID'));

        if (allDmIds.length === 0) {
            console.warn('No direct message recipients found. Please check your Discord ID and data package path.');
            return;
        }

        if (configManager.get('DRY_RUN')) {
            console.log('Running in DRY RUN mode - no actual API calls will be made');
            console.log(`Would process ${allDmIds.length} direct message recipients`);
            return;
        }

        // Close all currently open direct messages
        await closeAllOpenDMs();

        const totalBatches = Math.ceil(allDmIds.length / configManager.get('BATCH_SIZE'));
        console.log(`\nProcessing ${allDmIds.length} direct messages in ${totalBatches} batches of ${configManager.get('BATCH_SIZE')}`);
        
        if (startBatch > 0) {
            console.log(`Resuming from batch ${startBatch + 1}/${totalBatches}`);
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
                console.log('\nBatch complete. Please review these direct messages.');
                await waitForKeyPress(rlInterface);

                await closeBatchDMs();
            }
        }

        console.log('\nProcessing complete!');
        console.log(`Processed users: ${processedUsers}`);
        console.log(`Skipped users: ${skippedUsers}`);
        
        // Mark as complete and clear state
        batchState.inProgress = false;
        saveBatchState(batchState);
        clearBatchState();
    } catch (error) {
        console.error(`Fatal error in main process: ${error.message}`);
        throw error;
    }
}

/**
 * Process all DMs with automatic export after each batch
 * @param {Function} exportCallback - Callback function to export DMs
 * @param {readline.Interface} rlInterface - Readline interface for user input
 * @returns {Promise<void>}
 */
async function processAndExportAllDMs(exportCallback, rlInterface = null) {
    try {
        await configManager.init();

        const channelJsonPaths = traverseDataPackage(configManager.get('DATA_PACKAGE_FOLDER'));
        const allDmIds = getRecipients(channelJsonPaths, configManager.getEnv('USER_DISCORD_ID'));

        if (allDmIds.length === 0) {
            console.warn('No direct message recipients found. Please check your Discord ID and data package path.');
            return;
        }

        if (configManager.get('DRY_RUN')) {
            console.log('Running in DRY RUN mode - no actual API calls will be made');
            console.log(`Would process ${allDmIds.length} direct message recipients`);
            return;
        }

        // Step 1: Close all currently open direct messages
        await closeAllOpenDMs();

        const totalBatches = Math.ceil(allDmIds.length / configManager.get('BATCH_SIZE'));
        console.log(`\nProcessing ${allDmIds.length} direct messages in ${totalBatches} batches of ${configManager.get('BATCH_SIZE')}`);
        console.log('Each batch will be automatically exported before moving to the next.');
        
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
            console.log('\nExporting current batch...');
            try {
                await exportCallback();
                console.log('Export completed successfully.');
            } catch (error) {
                console.error(`Export failed: ${error.message}`);
                const continueAnyway = rlInterface 
                    ? await promptConfirmation('Continue with next batch anyway? (y/n): ', rlInterface)
                    : false;
                
                if (!continueAnyway) {
                    console.log('Processing stopped by user.');
                    return;
                }
            }

            // Step 4: Close batch DMs
            await closeBatchDMs();
            
            // Small delay before next batch
            if (batchNum < totalBatches - 1) {
                console.log(`Batch ${batchNum + 1}/${totalBatches} complete. Moving to next batch...`);
                await delay(configManager.get('API_DELAY_MS') * 2);
            }
        }

        console.log('\nAll batches processed and exported!');
        console.log(`Total processed users: ${processedUsers}`);
        console.log(`Total skipped users: ${skippedUsers}`);
        
        // Mark as complete and clear state
        batchState.inProgress = false;
        saveBatchState(batchState);
        clearBatchState();
    } catch (error) {
        console.error(`Fatal error in main process: ${error.message}`);
        throw error;
    }
}

module.exports = {
    closeAllOpenDMs,
    openBatchDMs,
    closeBatchDMs,
    saveOpenDMsToFile,
    processDMsInBatches,
    processAndExportAllDMs
};

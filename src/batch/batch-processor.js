const path = require('path');
const { getConfigManager } = require('../config');
const { getCurrentOpenDMs, reopenDM, closeDM, delay } = require('../discord-api');
const { traverseDataPackage, getRecipients, resolveConfigPath, readJsonFile, writeJsonFile, updateIdHistory } = require('../lib/file-utils');
const { waitForKeyPress, promptConfirmation, createDMProgressBar } = require('../lib/cli-helpers');
const { saveBatchState, loadBatchState, clearBatchState } = require('./batch-state');
const { isDryRun } = require('../lib/dry-run-helper');
const { getApiDelayTracker } = require('../lib/api-delay-tracker');

const configManager = getConfigManager();
const delayTracker = getApiDelayTracker();

function createBatchState(allDmIds, totalBatches, currentBatch = 0) {
    return {
        allDmIds,
        totalBatches,
        currentBatch,
        processedUsers: 0,
        skippedUsers: 0,
        timestamp: new Date().toISOString(),
        inProgress: true
    };
}

async function initializeBatchProcessing(typeFilter = null) {
    await configManager.init();
    
    const channelJsonPaths = traverseDataPackage(configManager.get('DATA_PACKAGE_FOLDER'));
    const allDmIds = getRecipients(channelJsonPaths, configManager.getEnv('USER_DISCORD_ID'), typeFilter);
    
    if (allDmIds.length === 0) {
        console.warn('No direct message recipients found. Please check your Discord ID and data package path.');
        return null;
    }
    
    if (isDryRun()) {
        console.log('Running in DRY RUN mode - no actual API calls will be made');
        console.log(`Would process ${allDmIds.length} direct message recipients`);
        return null;
    }
    
    await closeAllOpenDMs();
    
    const totalBatches = Math.ceil(allDmIds.length / configManager.get('BATCH_SIZE'));
    console.log(`\nProcessing ${allDmIds.length} direct messages in ${totalBatches} batches of ${configManager.get('BATCH_SIZE')}`);
    
    return { allDmIds, totalBatches };
}

async function closeAllOpenDMs() {
    try {
        const currentDMs = await getCurrentOpenDMs(configManager.getEnv('AUTHORIZATION_TOKEN'));
        await delayTracker.trackAndDelay();
        
        if (currentDMs.length === 0) {
            console.log('No open direct messages to close.');
            return [];
        }

        const dmCount = currentDMs.filter(dm => dm.type === 1 && Array.isArray(dm.recipients) && dm.recipients.length > 0).length;
        
        const dataPackagePath = configManager.get('DATA_PACKAGE_FOLDER');
        const filePath = path.join(dataPackagePath, 'messages', 'id-history.json');
        
        if (isDryRun()) {
            console.log(`[DRY RUN] Found ${dmCount} open direct messages that would be closed`);
            console.log('[DRY RUN] Saving channel data to id-history.json...');
            updateIdHistory(filePath, currentDMs);
            console.log('[DRY RUN] Channel data saved. Would close these DMs:');
            currentDMs.forEach(dm => {
                if (dm.type === 1 && dm.recipients && dm.recipients.length > 0) {
                    const username = dm.recipients[0].username || 'Unknown';
                    console.log(`  - ${username} (ID: ${dm.id})`);
                }
            });
            return [];
        }

        console.log(`Closing ${dmCount} open direct messages...`);
        delayTracker.reset(dmCount);
        
        console.log('Saving channel data to id-history.json before closing...');
        updateIdHistory(filePath, currentDMs);
        console.log('Channel data saved. Now closing DMs...');
        
        const closedUserIds = [];
        
        const closeProgress = createDMProgressBar();
        closeProgress.start(currentDMs.length, 0);
        
        for (const [index, dm] of currentDMs.entries()) {
            if (dm.type === 1 && Array.isArray(dm.recipients) && dm.recipients.length > 0) {
                await closeDM(configManager.getEnv('AUTHORIZATION_TOKEN'), dm.id);
                await delayTracker.trackAndDelay();
                
                const recipientIds = dm.recipients.map(r => r && r.id).filter(Boolean);
                closedUserIds.push(...recipientIds);
            }
            closeProgress.update(index + 1);
        }
        closeProgress.stop();
        
        console.log(`Successfully closed ${closedUserIds.length} direct messages. Channel info was saved to ${filePath}`);
        
        return closedUserIds;
    } catch (error) {
        console.error(`Failed to close all open direct messages: ${error.message}`);
        throw error;
    }
}

async function openBatchDMs(userIds, batchNum, totalBatches) {
    if (isDryRun()) {
        console.log(`[DRY RUN] Would open batch ${batchNum + 1}/${totalBatches} with ${userIds.length} direct messages`);
        userIds.forEach((userId, index) => {
            console.log(`  ${index + 1}. Would reopen DM with user ID: ${userId}`);
        });
        return { processed: userIds.length, skipped: 0, reopenedIds: [] };
    }

    console.log(`Opening batch ${batchNum + 1}/${totalBatches} (${userIds.length} direct messages)...`);
    delayTracker.reset(userIds.length);
    
    const batchProgress = createDMProgressBar();
    batchProgress.start(userIds.length, 0);
    
    let skippedUsers = 0;
    let processedUsers = 0;
    const successfullyReopened = [];
    
    for (const [index, userId] of userIds.entries()) {
        const result = await reopenDM(configManager.getEnv('AUTHORIZATION_TOKEN'), userId);
        if (result === null) {
            skippedUsers++;
        } else {
            processedUsers++;
            successfullyReopened.push(userId);
        }
        
        await delayTracker.trackAndDelay();
        batchProgress.update(index + 1);
    }
    batchProgress.stop();
    
    return { processed: processedUsers, skipped: skippedUsers, reopenedIds: successfullyReopened };
}

async function closeBatchDMs() {
    if (isDryRun()) {
        console.log('[DRY RUN] Fetching current batch direct messages...');
        const batchDMs = await getCurrentOpenDMs(configManager.getEnv('AUTHORIZATION_TOKEN'));
        await delayTracker.trackAndDelay();
        
        const dmCount = batchDMs.filter(dm => dm.type === 1).length;
        console.log(`[DRY RUN] Would close ${dmCount} direct messages:`);
        batchDMs.forEach((dm, index) => {
            if (dm.type === 1 && dm.recipients && dm.recipients.length > 0) {
                const username = dm.recipients[0].username || 'Unknown';
                console.log(`  ${index + 1}. Would close DM with ${username} (Channel ID: ${dm.id})`);
            }
        });
        return;
    }

    console.log('Closing current batch direct messages...');
    const batchDMs = await getCurrentOpenDMs(configManager.getEnv('AUTHORIZATION_TOKEN'));
    await delayTracker.trackAndDelay();
    
    delayTracker.reset(batchDMs.filter(dm => dm.type === 1).length);
    
    for (const dm of batchDMs) {
        if (dm.type === 1) {
            await closeDM(configManager.getEnv('AUTHORIZATION_TOKEN'), dm.id);
            await delayTracker.trackAndDelay();
        }
    }
    console.log(`Closed ${batchDMs.length} batch direct messages`);
}

async function processDMsInBatches(startBatch = 0, rlInterface = null) {
    try {
        const setup = await initializeBatchProcessing();
        if (!setup) return;
        
        const { allDmIds, totalBatches } = setup;
        
        if (startBatch > 0) {
            console.log(`Resuming from batch ${startBatch + 1}/${totalBatches}`);
        }
        
        let skippedUsers = 0;
        let processedUsers = 0;
        
        const batchState = createBatchState(allDmIds, totalBatches, startBatch);
        saveBatchState(batchState);
        
        for (let batchNum = startBatch; batchNum < totalBatches; batchNum++) {
            const startIdx = batchNum * configManager.get('BATCH_SIZE');
            const endIdx = Math.min((batchNum + 1) * configManager.get('BATCH_SIZE'), allDmIds.length);
            const currentBatch = allDmIds.slice(startIdx, endIdx);

            // Open batch
            const stats = await openBatchDMs(currentBatch, batchNum, totalBatches);
            processedUsers += stats.processed;
            skippedUsers += stats.skipped;

            // Update and save state immediately after opening batch
            batchState.currentBatch = batchNum + 1;
            batchState.processedUsers = processedUsers;
            batchState.skippedUsers = skippedUsers;
            batchState.reopenedInCurrentBatch = stats.reopenedIds || [];
            batchState.timestamp = new Date().toISOString();
            saveBatchState(batchState);

            if (!isDryRun()) {
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

async function processAndExportAllDMs(exportCallback, rlInterface = null, typeFilter = ['DM', 'GROUP_DM']) {
    try {
        const setup = await initializeBatchProcessing(typeFilter);
        if (!setup) return;
        
        const { allDmIds, totalBatches } = setup;
        console.log('Each batch will be automatically exported before moving to the next.');
        
        let skippedUsers = 0;
        let processedUsers = 0;
        
        const batchState = createBatchState(allDmIds, totalBatches);
        saveBatchState(batchState);
        
        for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
            const startIdx = batchNum * configManager.get('BATCH_SIZE');
            const endIdx = Math.min((batchNum + 1) * configManager.get('BATCH_SIZE'), allDmIds.length);
            const currentBatch = allDmIds.slice(startIdx, endIdx);

            const stats = await openBatchDMs(currentBatch, batchNum, totalBatches);
            processedUsers += stats.processed;
            skippedUsers += stats.skipped;

            // Update and save state immediately after opening batch
            batchState.currentBatch = batchNum + 1;
            batchState.processedUsers = processedUsers;
            batchState.skippedUsers = skippedUsers;
            batchState.reopenedInCurrentBatch = stats.reopenedIds || [];
            batchState.timestamp = new Date().toISOString();
            saveBatchState(batchState);

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
    processDMsInBatches,
    processAndExportAllDMs
};

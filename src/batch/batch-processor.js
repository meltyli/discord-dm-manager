const path = require('path');
const { getConfigManager } = require('../config');
const { getCurrentOpenDMs, reopenDM, closeDM, delay } = require('../discord-api');
const { traverseDataPackage, getRecipients, resolveConfigPath, readJsonFile, writeJsonFile, updateIdHistory, getChannelsToExport, updateExportStatus, getCompletedExports } = require('../lib/file-utils');
const { waitForKeyPress, promptConfirmation, createDMProgressBar } = require('../lib/cli-helpers');
const { saveBatchState, loadBatchState, clearBatchState } = require('./batch-state');
const { isDryRun } = require('../lib/dry-run-helper');
const { getApiDelayTracker } = require('../lib/api-delay-tracker');
const { red, green, yellow, reset } = require('../lib/colors');
const { getIdHistoryPath } = require('../lib/path-utils');
const { getLogger } = require('../logger');

const logger = getLogger();

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
    
    process.stdout.write(`\n⠋ Loading data package.\r`);
    const channelJsonPaths = traverseDataPackage(configManager.get('DATA_PACKAGE_FOLDER'));
    console.log(`✓ Loading data package.`);
    console.log(`✓ Found ${channelJsonPaths.length} channels. Processing recipients`);
    
    const allDmIds = getRecipients(channelJsonPaths, configManager.getEnv('USER_DISCORD_ID'), typeFilter);
    
    if (allDmIds.length === 0) {
        console.warn('No direct message recipients found. Please check your Discord ID and data package path.');
        return null;
    }
    
    if (isDryRun()) {
        console.log('Running in DRY RUN mode - no modifications will be made');
        console.log(`Would process ${allDmIds.length} direct message recipients`);
        return null;
    }
    
    await closeAllOpenDMs();
    
    const totalBatches = Math.ceil(allDmIds.length / configManager.get('BATCH_SIZE'));
    const batchWord = totalBatches === 1 ? 'batch' : 'batches';
    console.log(`\nProcessing ${yellow}${allDmIds.length}${reset} direct messages in ${yellow}${totalBatches}${reset} ${batchWord} of ${yellow}${configManager.get('BATCH_SIZE')}${reset}`);
    
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
        const filePath = getIdHistoryPath(dataPackagePath);
        
        if (isDryRun()) {
            console.log(`[DRY RUN] Found ${dmCount} open direct messages that would be closed`);
            console.log('[DRY RUN] Saving channel data to id-history.json.');
            updateIdHistory(filePath, currentDMs);
            console.log('[DRY RUN] Channel data saved!\n\n Would close these DMs:');
            currentDMs.forEach(dm => {
                if (dm.type === 1 && dm.recipients && dm.recipients.length > 0) {
                    const username = dm.recipients[0].username || 'Unknown';
                    console.log(`  - ${username} (ID: ${dm.id})`);
                }
            });
            return [];
        }

        process.stdout.write(`\n⠋ Closing ${dmCount} open direct messages.\r`);
        delayTracker.reset(dmCount);
        
        process.stdout.write(`⠙ Saving channel data to id-history.json.\r`);
        updateIdHistory(filePath, currentDMs);
        
        const closedUserIds = [];
        
        const closeProgress = createDMProgressBar('Closing', true);
        closeProgress.start(currentDMs.length, 0, { username: 'Starting' });
        
        for (const [index, dm] of currentDMs.entries()) {
            if (dm.type === 1 && Array.isArray(dm.recipients) && dm.recipients.length > 0) {
                const recipient = dm.recipients[0];
                const username = recipient?.username || 'Unknown';
                const userId = recipient?.id || 'Unknown';
                const displayName = `${username} (${userId})`;
                
                closeProgress.update(index, { username: displayName });
                
                await closeDM(configManager.getEnv('AUTHORIZATION_TOKEN'), dm.id);
                await delayTracker.trackAndDelay();
                
                const recipientIds = dm.recipients.map(r => r && r.id).filter(Boolean);
                closedUserIds.push(...recipientIds);
            }
        }
        closeProgress.update(currentDMs.length);
        closeProgress.stop();
        process.stdout.write('\r\x1b[K');
        
        console.log(`✓ Successfully closed ${closedUserIds.length} DMs`);
        logger.logOnly(`⠋ Saving channel info to id-history.json`, 'info');
        logger.logOnly(`✓ Channel info saved to ${filePath}`, 'info');
        
        return closedUserIds;
    } catch (error) {
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

    process.stdout.write(`\n⠋ Opening batch ${batchNum + 1}/${totalBatches} (${userIds.length} direct messages)\r`);
    delayTracker.reset(userIds.length);
    
    // Load id-history to get usernames
    const dataPackagePath = configManager.get('DATA_PACKAGE_FOLDER');
    const idHistoryPath = getIdHistoryPath(dataPackagePath);
    let usernameMap = {};
    try {
        const idHistoryData = readJsonFile(idHistoryPath);
        // Build a map of userId -> username from uniqueChannels and latest
        ['uniqueChannels', 'latest'].forEach(field => {
            if (idHistoryData?.[field]) {
                idHistoryData[field].forEach(channel => {
                    if (channel.recipients && Array.isArray(channel.recipients)) {
                        channel.recipients.forEach(recipient => {
                            if (recipient?.id && recipient?.username && !usernameMap[recipient.id]) {
                                usernameMap[recipient.id] = recipient.username;
                            }
                        });
                    }
                });
            }
        });
    } catch (error) {
        // If we can't read id-history, continue without usernames
    }
    
    const batchProgress = createDMProgressBar('Opening', true);
    batchProgress.start(userIds.length, 0, { username: 'Starting' });
    
    let skippedUsers = 0;
    let processedUsers = 0;
    const successfullyReopened = [];
    
    try {
        for (const [index, userId] of userIds.entries()) {
            const username = usernameMap[userId] || 'Unknown';
            const displayName = `${username} (${userId})`;
            batchProgress.update(index, { username: displayName });
            
            const result = await reopenDM(configManager.getEnv('AUTHORIZATION_TOKEN'), userId, batchProgress);
            if (result === null) {
                skippedUsers++;
            } else {
                processedUsers++;
                successfullyReopened.push(userId);
            }
            
            await delayTracker.trackAndDelay();
        }
        batchProgress.update(userIds.length);
        batchProgress.stop();
        process.stdout.write('\r\x1b[K');
        console.log(`✓ Batch ${batchNum + 1}/${totalBatches} opened`);
        
        return { processed: processedUsers, skipped: skippedUsers, reopenedIds: successfullyReopened };
    } catch (error) {
        batchProgress.stop();
        console.log('');
        throw error;
    }
}

async function closeBatchDMs() {
    if (isDryRun()) {
        console.log('[DRY RUN] Fetching current batch direct messages.');
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

    process.stdout.write(`\n⠋ Closing current batch.\r`);
    const batchDMs = await getCurrentOpenDMs(configManager.getEnv('AUTHORIZATION_TOKEN'));
    await delayTracker.trackAndDelay();
    
    delayTracker.reset(batchDMs.filter(dm => dm.type === 1).length);
    
    for (const dm of batchDMs) {
        if (dm.type === 1) {
            await closeDM(configManager.getEnv('AUTHORIZATION_TOKEN'), dm.id);
            await delayTracker.trackAndDelay();
        }
    }
    console.log(`✓ Closed ${batchDMs.length} batch DMs`);
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
        
        // Mark as complete, save final state, then clear
        batchState.inProgress = false;
        saveBatchState(batchState);
        clearBatchState();
    } catch (error) {
        // Let the caller handle final error presentation.
        throw error;
    }
}

async function processAndExportAllDMs(exportCallback, rlInterface = null, typeFilter = ['DM', 'GROUP_DM']) {
    try {
        const setup = await initializeBatchProcessing(typeFilter);
        if (!setup) return;
        
        const { allDmIds, totalBatches } = setup;
        
        // Get id-history.json path for export status tracking
        const dataPackagePath = configManager.get('DATA_PACKAGE_FOLDER');
        const idHistoryPath = getIdHistoryPath(dataPackagePath);
        
        // Filter out already completed exports
        const channelsToExport = getChannelsToExport(idHistoryPath, allDmIds);
        const completedCount = allDmIds.length - channelsToExport.length;
        
        if (channelsToExport.length === 0) {
            console.log('\nAll DMs have already been exported!');
            return;
        }
        
        const statusMsg = completedCount > 0 
            ? `${channelsToExport.length} DM(s) remaining to export (${completedCount} already completed)`
            : `${channelsToExport.length} DM(s) to export`;
        console.log(`\n${statusMsg}`);
        console.log('Each batch will be automatically exported before moving to the next.');
        
        let skippedUsers = 0;
        let processedUsers = 0;
        let exportedCount = 0;
        let failedCount = 0;
        
        // Recalculate batches based on filtered list
        const adjustedTotalBatches = Math.ceil(channelsToExport.length / configManager.get('BATCH_SIZE'));
        const batchState = createBatchState(channelsToExport, adjustedTotalBatches);
        saveBatchState(batchState);
        
        for (let batchNum = 0; batchNum < adjustedTotalBatches; batchNum++) {
            const startIdx = batchNum * configManager.get('BATCH_SIZE');
            const endIdx = Math.min((batchNum + 1) * configManager.get('BATCH_SIZE'), channelsToExport.length);
            const currentBatch = channelsToExport.slice(startIdx, endIdx);

            const stats = await openBatchDMs(currentBatch, batchNum, adjustedTotalBatches);
            processedUsers += stats.processed;
            skippedUsers += stats.skipped;

            // Update and save state immediately after opening batch
            batchState.currentBatch = batchNum + 1;
            batchState.processedUsers = processedUsers;
            batchState.skippedUsers = skippedUsers;
            batchState.reopenedInCurrentBatch = stats.reopenedIds || [];
            batchState.timestamp = new Date().toISOString();
            saveBatchState(batchState);
            
            try {
                const exportResult = await exportCallback();
                
                const exportSuccess = exportResult && exportResult.success !== undefined 
                    ? exportResult.success 
                    : true;
                
                if (exportSuccess) {
                    exportedCount += stats.reopenedIds.length;
                } else {
                    console.error(`\n${red}Export completed with errors${reset}`);
                    failedCount += stats.reopenedIds.length;
                    
                    const continueAnyway = rlInterface 
                        ? await promptConfirmation('Continue with next batch anyway? (y/n): ', rlInterface)
                        : false;
                    
                    if (!continueAnyway) {
                        console.log('Processing stopped by user.');
                        return;
                    }
                }
            } catch (error) {
                console.error(`\n${red}Export failed: [${error.message}]${reset}`);
                failedCount += stats.reopenedIds.length;
                
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
            if (batchNum < adjustedTotalBatches - 1) {
                console.log(`\nBatch ${batchNum + 1}/${adjustedTotalBatches} complete, moving to next batch`);
                await delay(configManager.get('API_DELAY_MS') * 2);
            }
        }
        console.log('\nAll batches processed!');
        console.log(`Processed: ${processedUsers} | Skipped: ${skippedUsers} | Exported: ${exportedCount} | Failed: ${failedCount}`);
        
        // Mark as complete and save final state, then clear
        batchState.inProgress = false;
        saveBatchState(batchState);
        clearBatchState();
    } catch (error) {
        // Let the caller handle final error presentation.
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

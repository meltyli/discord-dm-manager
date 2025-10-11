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

async function waitForKeyPress() {
    logOutput('Press any key to continue...', 'info');
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

// Progress tracking
function createProgressBar() {
    return new cliProgress.SingleBar({
        format: 'Progress |{bar}| {percentage}% || {value}/{total} DMs',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591'
    });
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

// Main processing function
async function processDMsInBatches() {
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

        const currentDMs = await getCurrentOpenDMs(configManager.getEnv('AUTHORIZATION_TOKEN'), logOutput);
        logOutput(`Closing ${currentDMs.length} currently open DMs...`, 'info');
        
        const closeProgress = createProgressBar();
        closeProgress.start(currentDMs.length, 0);
        
        for (const [index, dm] of currentDMs.entries()) {
            if (dm.type === 1) {
                logOutput(`Closing DM channel: ${dm.id}`, 'debug');
                await closeDM(configManager.getEnv('AUTHORIZATION_TOKEN'), dm.id, logOutput);
                await delay(configManager.get('API_DELAY_MS'));
            }
            closeProgress.update(index + 1);
        }
        closeProgress.stop();

        const totalBatches = Math.ceil(allDmIds.length / configManager.get('BATCH_SIZE'));
        logOutput(`Processing ${allDmIds.length} DMs in ${totalBatches} batches of ${configManager.get('BATCH_SIZE')}`, 'info');
        
        const batchProgress = createProgressBar();
        let skippedUsers = 0;
        let processedUsers = 0;
        
        for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
            const startIdx = batchNum * configManager.get('BATCH_SIZE');
            const endIdx = Math.min((batchNum + 1) * configManager.get('BATCH_SIZE'), allDmIds.length);
            const currentBatch = allDmIds.slice(startIdx, endIdx);

            logOutput(`\nProcessing batch ${batchNum + 1}/${totalBatches}`, 'info');
            batchProgress.start(currentBatch.length, 0);

            for (const [index, userId] of currentBatch.entries()) {
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

            if (!configManager.get('DRY_RUN')) {
                logOutput('\nBatch complete. Please review these DMs.', 'info');
                await waitForKeyPress();

                logOutput('Closing batch DMs...', 'info');
                const batchDMs = await getCurrentOpenDMs(configManager.getEnv('AUTHORIZATION_TOKEN'), logOutput);
                for (const dm of batchDMs) {
                    if (dm.type === 1) {
                        await closeDM(configManager.getEnv('AUTHORIZATION_TOKEN'), dm.id, logOutput);
                        await delay(configManager.get('API_DELAY_MS'));
                    }
                }
            }
        }

        logOutput(`\nProcessing complete!`, 'info');
        logOutput(`Processed users: ${processedUsers}`, 'info');
        logOutput(`Skipped users: ${skippedUsers}`, 'info');
    } catch (error) {
        logOutput(`Fatal error in main process: ${error.message}`, 'error');
        throw error;
    }
}

module.exports = {
    processDMsInBatches,
    traverseDataPackage,
    getRecipients,
    saveOpenDMsToFile
};

// Only run if this file is executed directly (not imported)
if (require.main === module) {
    processDMsInBatches().catch(error => {
        logOutput(`Error in main process: ${error.stack}`, 'error');
        process.exit(1);
    });
}

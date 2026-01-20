#!/usr/bin/env node

const path = require('path');
const { initializeLogger, getLogger } = require('../logger');
const { getConfigManager } = require('../config');
const { getCurrentOpenDMs, closeDM } = require('../discord-api');
const { openBatchDMs, closeAllOpenDMs } = require('../batch/batch-processor');
const { exportDMs, createDMProgressBar } = require('../lib/cli-helpers');
const { validateRequired, validateDCEPath } = require('../lib/validators');
const { traverseDataPackage, getRecipients, updateIdHistory } = require('../lib/file-utils');
const { getApiDelayTracker } = require('../lib/api-delay-tracker');
const configDefaults = require('../lib/config-defaults');

const delayTracker = getApiDelayTracker();

// Initialize logger
initializeLogger(configDefaults.LOG_DIR || './logs', 10);

function showUsage() {
    console.log(`
DiscorDManager - CLI Mode

Usage:
  docker-compose run --rm discordmanager [options]

Options:
  -s, --username <username...>         Export DMs for specific Discord username(s)
                                         Multiple usernames can be space-separated
                                         Quote usernames with spaces: "User Name"
  -u, --user-id <id...>                Export DMs for specific Discord user ID(s)
  -a, --all                            Export all DMs (default behavior)
  -h, --help                           Show this help message

Examples:
  # Export DMs for specific users by username
  docker-compose run --rm discordmanager -s username1 username2 "user three"
  
  # Export DMs for specific user IDs
  docker-compose run --rm discordmanager -u 123456789 987654321
  
  # Export all DMs
  docker-compose run --rm discordmanager --all

Configuration:
  To configure settings (token, auth, etc.), use the interactive menu:
  docker-compose run --rm discordmanager interactive

Note: Only exports 1-on-1 DMs (type 1). Group DMs are not supported.
`);
}

function parseArgs() {
    const args = process.argv.slice(2);
    const parsed = {
        usernames: [],
        userIds: [],
        all: false,
        help: false
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        if (arg === '-h' || arg === '--help') {
            parsed.help = true;
        } else if (arg === '-a' || arg === '--all') {
            parsed.all = true;
        } else if (arg === '-s' || arg === '--username') {
            i++;
            while (i < args.length && !args[i].startsWith('-')) {
                parsed.usernames.push(args[i]);
                i++;
            }
            i--;
        } else if (arg === '-u' || arg === '--user-id') {
            i++;
            while (i < args.length && !args[i].startsWith('-')) {
                parsed.userIds.push(args[i]);
                i++;
            }
            i--;
        }
    }

    return parsed;
}

async function getUserIdByUsername(username, dataPackagePath, myUserId) {
    const channelJsonPaths = traverseDataPackage(dataPackagePath);
    
    for (const channelPath of channelJsonPaths) {
        const channelData = require(channelPath);
        if (channelData.recipients && channelData.type === 'DM') {
            for (const recipient of channelData.recipients) {
                if (recipient.username && 
                    recipient.username.toLowerCase() === username.toLowerCase() &&
                    recipient.id !== myUserId) {
                    return recipient.id;
                }
            }
        }
    }
    
    return null;
}

async function resolveUserIds(usernames, configManager) {
    const userIds = [];
    const dataPackagePath = configManager.get('DATA_PACKAGE_FOLDER');
    const myUserId = configManager.getEnv('USER_DISCORD_ID');
    
    console.log(`\nResolving usernames to Discord IDs...`);
    
    for (const username of usernames) {
        const userId = await getUserIdByUsername(username, dataPackagePath, myUserId);
        if (userId) {
            console.log(`  ✓ Found ${username}: ${userId}`);
            userIds.push(userId);
        } else {
            console.warn(`  ✗ Could not find user: ${username}`);
        }
    }
    
    return userIds;
}

async function savePendingOpenDMs(idHistoryPath, userIds) {
    const { readJsonFile, writeJsonFile } = require('../lib/file-utils');
    let idHistoryData = {};
    
    try {
        idHistoryData = readJsonFile(idHistoryPath) || {};
    } catch (error) {
        // If file doesn't exist, start fresh
    }
    
    // Add pending list to track DMs we're about to open
    idHistoryData.pendingOpen = userIds.map(id => ({
        userId: id,
        timestamp: new Date().toISOString()
    }));
    
    writeJsonFile(idHistoryPath, idHistoryData);
}

async function clearPendingOpenDMs(idHistoryPath) {
    const { readJsonFile, writeJsonFile } = require('../lib/file-utils');
    let idHistoryData = {};
    
    try {
        idHistoryData = readJsonFile(idHistoryPath) || {};
        delete idHistoryData.pendingOpen;
        writeJsonFile(idHistoryPath, idHistoryData);
    } catch (error) {
        // If we can't clear, that's okay
    }
}

async function manageDMState(configManager, targetUserIds) {
    const token = configManager.getEnv('USER_DISCORD_TOKEN');
    const dataPackagePath = configManager.get('DATA_PACKAGE_FOLDER');
    const idHistoryPath = path.join(dataPackagePath, 'messages', 'id-history.json');
    
    // Step 1: Get currently open DMs
    const yellow = '\x1b[33m';
    const reset = '\x1b[0m';
    console.log(`\n${yellow}Step 1: Saving current DM state...${reset}`);
    const currentlyOpenDMs = await getCurrentOpenDMs(token);
    await delayTracker.trackAndDelay();
    
    const currentDMUserIds = currentlyOpenDMs
        .filter(dm => dm.type === 1 && Array.isArray(dm.recipients) && dm.recipients.length > 0)
        .map(dm => dm.recipients[0].id);
    
    console.log(`Found ${currentDMUserIds.length} currently open DM(s)`);
    
    // Save channel info to id-history
    updateIdHistory(idHistoryPath, currentlyOpenDMs);
    
    // Step 2: Close all open DMs using existing function
    console.log(`\n${yellow}Step 2: Closing current open DMs...${reset}`);
    await closeAllOpenDMs();
    
    // Step 3: Mark pending DMs to be opened
    await savePendingOpenDMs(idHistoryPath, targetUserIds);
    
    // Step 4: Open target DMs using existing batch function
    console.log(`\n${yellow}Step 3: Opening ${targetUserIds.length} target DM(s)...${reset}`);
    const { reopenedIds } = await openBatchDMs(targetUserIds, 0, 1);
    
    // Step 5: Clear pending list after successful open
    await clearPendingOpenDMs(idHistoryPath);
    
    return { previouslyOpenDMs: currentDMUserIds, successfullyOpened: reopenedIds };
}

async function exportCurrentDMs(configManager) {
    const token = configManager.getEnv('USER_DISCORD_TOKEN');
    
    const yellow = '\x1b[33m';
    const reset = '\x1b[0m';
    console.log(`\n${yellow}Step 4: Exporting opened DMs with Discord Chat Exporter...${reset}`);
    
    const currentDMs = await getCurrentOpenDMs(token);
    await delayTracker.trackAndDelay();
    
    const dmChannels = currentDMs.filter(dm => dm.type === 1);
    
    if (dmChannels.length === 0) {
        console.log('No DMs to export.');
        return;
    }
    
    const progressBar = createDMProgressBar('Exporting', true);
    
    return await exportDMs(
        configManager.get('DCE_PATH'),
        configManager.get('EXPORT_PATH'),
        token,
        configManager.get('EXPORT_FORMAT'),
        progressBar,
        configManager.get('EXPORT_MEDIA_TOGGLE'),
        configManager.get('EXPORT_REUSE_MEDIA')
    );
}

async function restoreDMState(configManager, previouslyOpenDMs) {
    const token = configManager.getEnv('USER_DISCORD_TOKEN');
    
    // Step 5: Close exported DMs
    const yellow = '\x1b[33m';
    const reset = '\x1b[0m';
    console.log(`\n${yellow}Step 5: Closing exported DMs...${reset}`);
    await closeAllOpenDMs();
    
    // Step 6: Reopen previously open DMs using batch function
    if (previouslyOpenDMs.length > 0) {
        console.log(`\n${yellow}Step 6: Reopening ${previouslyOpenDMs.length} previously open DM(s)...${reset}`);
        await openBatchDMs(previouslyOpenDMs, 0, 1);
        console.log('DM state restored.');
    }
}

async function runCLI() {
    const args = parseArgs();
    
    if (args.help) {
        showUsage();
        process.exit(0);
    }
    
    const configManager = getConfigManager();
    
    // Load configuration
    try {
        await configManager.init();
        console.log('Configuration loaded successfully.');
    } catch (error) {
        console.error('Error loading configuration:', error.message);
        console.error('\nMake sure config/config.json and config/.env exist and are properly configured.');
        console.error('Run the interactive menu to configure: npm start');
        process.exit(1);
    }
    
    // Validate required settings
    try {
        validateRequired(configManager.get('DCE_PATH'), 'DCE_PATH', 'Discord Chat Exporter path');
        validateDCEPath(configManager.get('DCE_PATH'));
        validateRequired(configManager.get('EXPORT_PATH'), 'EXPORT_PATH', 'export path');
        validateRequired(configManager.getEnv('USER_DISCORD_TOKEN'), 'USER_DISCORD_TOKEN', 'Discord token');
        validateRequired(configManager.getEnv('USER_DISCORD_ID'), 'USER_DISCORD_ID', 'Discord user ID');
    } catch (error) {
        console.error('Configuration validation error:', error.message);
        console.error('Run the interactive menu to configure: npm start');
        process.exit(1);
    }
    
    let targetUserIds = [];
    
    // Resolve usernames to IDs if provided
    if (args.usernames.length > 0) {
        targetUserIds = await resolveUserIds(args.usernames, configManager);
        if (targetUserIds.length === 0) {
            console.error('\nNo matching users found for the provided usernames.');
            process.exit(1);
        }
    }
    
    // Add explicitly provided user IDs
    if (args.userIds.length > 0) {
        targetUserIds.push(...args.userIds);
    }
    
    // Get all DM user IDs if --all is specified
    if (args.all) {
        console.log('\nGetting all DM user IDs...');
        const dataPackagePath = configManager.get('DATA_PACKAGE_FOLDER');
        const myUserId = configManager.getEnv('USER_DISCORD_ID');
        const channelJsonPaths = traverseDataPackage(dataPackagePath);
        targetUserIds = getRecipients(channelJsonPaths, myUserId, ['DM']);
        console.log(`Found ${targetUserIds.length} DM(s) to export`);
    }
    
    // Validate we have users to export
    if (targetUserIds.length === 0) {
        console.log('No users specified. Use -s, -u, or --all flag.\n');
        showUsage();
        process.exit(1);
    }
    
    try {
        console.log(`\n=== Starting export for ${targetUserIds.length} DM(s) ===`);
        
        // Manage DM state and open target DMs
        const { previouslyOpenDMs } = await manageDMState(configManager, targetUserIds);
        
        // Export the opened DMs
        await exportCurrentDMs(configManager);
        
        // Restore DM state
        await restoreDMState(configManager, previouslyOpenDMs);
        
        const green = '\x1b[32m';
        const reset = '\x1b[0m';
        console.log(`\n${green}✓ Export completed successfully!${reset}`);
        process.exit(0);
    } catch (error) {
        const red = '\x1b[31m';
        const reset = '\x1b[0m';
        console.error(`\n${red}✗ Export failed:${reset} ${error.message}`);
        getLogger().error('CLI Export Error:', error);
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    runCLI().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { runCLI, parseArgs };

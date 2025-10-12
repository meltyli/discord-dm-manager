const path = require('path');
const { getCurrentOpenDMs, closeDM, reopenDM } = require('../discord-api');
const { saveOpenDMsToFile, processAndExportAllDMs, closeAllOpenDMs } = require('../batch/batch-processor');
const { resolveConfigPath, readJsonFile, validatePathExists, validateRequiredConfig, validateDCEPath } = require('../lib/file-utils');
const { promptUser, waitForKeyPress, getMenuChoice, clearScreen, cleanInput, promptConfirmation, exportDMs, createDMProgressBar } = require('../lib/cli-helpers');
const { displaySettings } = require('./menu-helpers');
const { getLogger } = require('../logger');

class ApiMenu {
    constructor(rl, configManager, ensureConfiguredFn) {
        this.rl = rl;
        this.configManager = configManager;
        this.ensureConfigured = ensureConfiguredFn;
    }

    get options() {
        return this.configManager.config;
    }

    async show() {
        while (true) {
            clearScreen();
            getLogger().logOnly('[MENU] Discord API Menu');
            
            getLogger().pause(); // Pause logging for menu display
            console.log('\nDiscord API');
            console.log('===========');
            console.log('1. Export All Direct Messages');
            console.log('2. List Current Open Direct Messages');
            console.log('3. Close All Open Direct Messages');
            console.log('4. Reopen Direct Message (Specific User ID)');
            console.log('5. Reset DM State (Reopen Closed Direct Messages)');
            console.log('q. Back to Main Menu');
            displaySettings(this.options);
            getLogger().resume(); // Resume logging

            const choice = await getMenuChoice(this.rl);

            try {
                switch (choice) {
                    case '1':
                        getLogger().logOnly('[ACTION] Export All Direct Messages');
                        await this.processAndExportAllDMs();
                        await waitForKeyPress(this.rl);
                        break;
                    case '2':
                        getLogger().logOnly('[ACTION] List Current Open Direct Messages');
                        await this.viewOpenDMs();
                        await waitForKeyPress(this.rl);
                        break;
                    case '3':
                        getLogger().logOnly('[ACTION] Close All Open Direct Messages');
                        await this.closeAllDMs();
                        await waitForKeyPress(this.rl);
                        break;
                    case '4':
                        getLogger().logOnly('[ACTION] Reopen Direct Message (Specific User ID)');
                        await this.reopenSpecificDM();
                        await waitForKeyPress(this.rl);
                        break;
                    case '5':
                        getLogger().logOnly('[ACTION] Reset DM State (Reopen Closed Direct Messages)');
                        await this.resetDMState();
                        await waitForKeyPress(this.rl);
                        break;
                    case 'q':
                        return;
                    default:
                        console.log('Invalid option. Please try again.');
                        await waitForKeyPress(this.rl);
                }
            } catch (error) {
                console.error('Error:', error.message);
                await waitForKeyPress(this.rl);
            }
        }
    }

    async resetDMState() {
        await this.ensureConfigured();
        
        const dataPackagePath = this.configManager.get('DATA_PACKAGE_FOLDER');
        const idHistoryPath = path.join(dataPackagePath, 'messages', 'id-history.json');
        
        if (!validatePathExists(idHistoryPath, 'id-history.json')) {
            console.log('\nNo id-history.json file found. Nothing to reopen.');
            return;
        }
        
        const idHistoryData = readJsonFile(idHistoryPath);
        if (!idHistoryData) {
            console.log('\nCould not read id-history.json. Nothing to reopen.');
            return;
        }
        
        // Handle both new structure { latest: [], uniqueIds: [] } and legacy formats
        let closedIds;
        if (Array.isArray(idHistoryData)) {
            closedIds = idHistoryData;
        } else if (idHistoryData.latest && Array.isArray(idHistoryData.latest)) {
            closedIds = idHistoryData.latest;
        } else if (idHistoryData.current && Array.isArray(idHistoryData.current)) {
            // Handle old property name
            closedIds = idHistoryData.current;
        } else {
            console.log('\nInvalid id-history.json format. Nothing to reopen.');
            return;
        }
        
        if (closedIds.length === 0) {
            console.log('\nNo closed DMs to reopen.');
            return;
        }
        
        console.log(`\nReopening ${closedIds.length} closed DMs...`);
        
        if (this.options.DRY_RUN) {
            console.log('[DRY RUN] Would reopen these user IDs:');
            console.log(closedIds);
            console.log('[DRY RUN] Would NOT clear id-history.json (preserves default state)');
            return;
        }
        
        const reopenProgress = createDMProgressBar();
        reopenProgress.start(closedIds.length, 0);
        
        let skipped = 0;
        let reopened = 0;
        
        for (const [index, userId] of closedIds.entries()) {
            const result = await reopenDM(process.env.AUTHORIZATION_TOKEN, userId);
            if (result === null) {
                skipped++;
            } else {
                reopened++;
            }
            await new Promise(resolve => setTimeout(resolve, this.options.API_DELAY_MS));
            reopenProgress.update(index + 1);
        }
        reopenProgress.stop();
        
        console.log(`\nReopened: ${reopened}, Skipped: ${skipped}`);
        console.log('DM state reset complete. id-history.json NOT cleared (preserves default state).');
    }

    async viewOpenDMs() {
        await this.ensureConfigured();
        
        if (this.options.DRY_RUN) {
            console.log('\n[DRY RUN] Skipping fetch of open DMs - no API call will be made');
            return;
        }

        console.log('\nFetching open DMs...');
        const dms = await getCurrentOpenDMs(process.env.AUTHORIZATION_TOKEN);
        console.log(`\nCurrently open DMs: ${dms.length}`);
        dms.forEach(dm => {
            if (dm.recipients && dm.recipients[0]) {
                console.log(`- Channel ID: ${dm.id}, User: ${dm.recipients[0].username}`);
            }
        });
    }

    async closeAllDMs() {
        await this.ensureConfigured();
        
        if (this.options.DRY_RUN) {
            console.log('\n[DRY RUN] Would fetch and close all open DMs - no API calls will be made');
            return;
        }

        console.log('\nClosing all open DMs...');
        await closeAllOpenDMs();
        console.log('All DMs closed successfully! User IDs saved to id-history.json');
    }

    async reopenSpecificDM() {
        await this.ensureConfigured();
        
        const userId = cleanInput(await promptUser('\nEnter Discord User ID: ', this.rl));
        
        if (this.options.DRY_RUN) {
            console.log(`[DRY RUN] Would reopen DM with user ${userId} - no API call will be made`);
            return;
        }

        try {
            await reopenDM(process.env.AUTHORIZATION_TOKEN, userId);
            console.log('DM reopened successfully!');
        } catch (error) {
            console.error('Failed to reopen DM:', error.message);
        }
    }

    async processAndExportAllDMs() {
        await this.ensureConfigured();
        
        // Validate DCE_PATH and EXPORT_PATH
        try {
            validateDCEPath(this.options.DCE_PATH);
            validateRequiredConfig(this.options.EXPORT_PATH, 'EXPORT_PATH', 'export path');
        } catch (error) {
            console.error(`\nError: ${error.message}`);
            return;
        }

        console.log('\nProcess and Export All DMs');
        console.log('==========================');
        console.log('This will:');
        console.log('1. Close all currently open DMs');
        console.log('2. Open DMs in batches of', this.options.BATCH_SIZE);
        console.log('3. Export each batch using Discord Chat Exporter');
        console.log('4. Close the batch and move to the next');
        console.log('5. Repeat until all DMs are processed\n');
        
        if (!await promptConfirmation('Continue? (y/n): ', this.rl)) {
            console.log('Operation cancelled.');
            return;
        }

        // Create export callback using centralized helper
        const exportCallback = async () => {
            await exportDMs(
                process.env.AUTHORIZATION_TOKEN,
                this.options.EXPORT_PATH,
                this.options.DCE_PATH
            );
        };

        try {
            await processAndExportAllDMs(exportCallback, this.rl);
            console.log('\nAll DMs processed and exported successfully!');
        } catch (error) {
            console.error('Process and export failed:', error.message);
        }
    }
}

module.exports = { ApiMenu };

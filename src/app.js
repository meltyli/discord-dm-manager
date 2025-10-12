const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { initializeLogger } = require('./logger');
const { MessageParser } = require('./parse-messages');
const {
    getCurrentOpenDMs,
    closeDM,
    reopenDM
} = require('./discord-api');
const { saveOpenDMsToFile, processAndExportAllDMs, closeAllOpenDMs } = require('./discord-dm-manager');
const { getConfigManager } = require('./config');
const { resolveConfigPath, readJsonFile, writeJsonFile, ensureExportPath, validatePathExists, validateRequiredConfig, validateDCEPath } = require('./lib/file-utils');
const { waitForKeyPress, getMenuChoice, clearScreen, cleanInput, promptConfirmation, exportDMs, createDMProgressBar } = require('./lib/cli-helpers');

// Initialize logger to capture all console output
initializeLogger('./logs', 10);

class DiscordDMApp {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        this.configManager = getConfigManager();
        // Share our readline interface with config manager
        this.configManager.setReadline(this.rl);
        this.options = this.configManager.config;
    }

    async showMenu() {
        while (true) {
            clearScreen();
            console.log('\nDiscord DM Manager');
            console.log('=================');
            console.log('1. Configuration');
            console.log('2. Discord API');
            console.log('q. Exit');
            console.log('\nCurrent Settings:');
            console.log(`- Dry Run Mode: ${this.options.DRY_RUN ? 'Enabled' : 'Disabled'}`);

            const choice = await getMenuChoice(this.rl);

            try {
                switch (choice) {
                    case '1':
                        await this.configurationMenu();
                        break;
                    case '2':
                        await this.discordApiMenu();
                        break;
                    case 'q':
                        console.log('Goodbye!');
                        this.rl.close();
                        return;
                    default:
                        console.log('Invalid option. Please try again.');
                        await waitForKeyPress(this.rl);
                }
            } catch (error) {
                // Don't show error if it's just config completion
                if (error.message !== 'CONFIG_COMPLETE') {
                    console.error('Error:', error.message);
                    await waitForKeyPress(this.rl);
                }
            }
        }
    }

    async discordApiMenu() {
        while (true) {
            clearScreen();
            console.log('\nDiscord API');
            console.log('===========');
            console.log('1. Export All Direct Messages');
            console.log('2. List Current Open Direct Messages');
            console.log('3. Close All Open Direct Messages');
            console.log('4. Reopen Direct Message (Specific User ID)');
            console.log('5. Reset DM State (Reopen Closed Direct Messages)');
            console.log('q. Back to Main Menu');
            console.log('\nCurrent Settings:');
            console.log(`- Dry Run Mode: ${this.options.DRY_RUN ? 'Enabled' : 'Disabled'}`);

            const choice = await getMenuChoice(this.rl);

            try {
                switch (choice) {
                    case '1':
                        await this.processAndExportAllDMs();
                        await waitForKeyPress(this.rl);
                        break;
                    case '2':
                        await this.viewOpenDMs();
                        await waitForKeyPress(this.rl);
                        break;
                    case '3':
                        await this.closeAllDMs();
                        await waitForKeyPress(this.rl);
                        break;
                    case '4':
                        await this.reopenSpecificDM();
                        await waitForKeyPress(this.rl);
                        break;
                    case '5':
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
        
        const closedIdsPath = resolveConfigPath('closedIDs.json');
        
        if (!validatePathExists(closedIdsPath, 'closedIDs.json')) {
            console.log('\nNo closedIDs.json file found. Nothing to reopen.');
            return;
        }
        
        const closedIdsData = readJsonFile(closedIdsPath);
        if (!closedIdsData) {
            console.log('\nCould not read closedIDs.json. Nothing to reopen.');
            return;
        }
        
        // Handle both new structure { current: [], all: [] } and legacy array format
        let closedIds;
        if (Array.isArray(closedIdsData)) {
            closedIds = closedIdsData;
        } else if (closedIdsData.current && Array.isArray(closedIdsData.current)) {
            closedIds = closedIdsData.current;
        } else {
            console.log('\nInvalid closedIDs.json format. Nothing to reopen.');
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
            console.log('[DRY RUN] Would NOT clear closedIDs.json (preserves default state)');
            return;
        }
        
        const reopenProgress = createDMProgressBar();
        reopenProgress.start(closedIds.length, 0);
        
        let skipped = 0;
        let reopened = 0;
        
        for (const [index, userId] of closedIds.entries()) {
            const result = await reopenDM(process.env.AUTHORIZATION_TOKEN, userId, console.log);
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
        console.log('DM state reset complete. closedIDs.json NOT cleared (preserves default state).');
    }

    async viewOpenDMs() {
        await this.ensureConfigured();
        
        if (this.options.DRY_RUN) {
            console.log('\n[DRY RUN] Skipping fetch of open DMs - no API call will be made');
            return;
        }

        console.log('\nFetching open DMs...');
        const dms = await getCurrentOpenDMs(process.env.AUTHORIZATION_TOKEN, console.log);
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
        console.log('All DMs closed successfully! User IDs saved to closedIDs.json');
    }

    async reopenSpecificDM() {
        await this.ensureConfigured();
        
        const userId = cleanInput(await waitForKeyPress(this.rl, '\nEnter Discord User ID: '));
        
        if (this.options.DRY_RUN) {
            console.log(`[DRY RUN] Would reopen DM with user ${userId} - no API call will be made`);
            return;
        }

        try {
            await reopenDM(process.env.AUTHORIZATION_TOKEN, userId, console.log);
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

    async configurationMenu() {
        if (!this.configManager.initialized) {
            console.log('\nStarting initial configuration...\n');
            await this.configManager.init();
            this.options = this.configManager.config;
            console.log('\nConfiguration complete!');
            await waitForKeyPress(this.rl);
            return;
        }

        while (true) {
            clearScreen();
            console.log('\nConfiguration');
            console.log('=============');
            console.log('\nPath Settings:');
            console.log(`  DATA_PACKAGE_FOLDER: ${this.options.DATA_PACKAGE_FOLDER || 'Not set'}`);
            console.log(`  EXPORT_PATH: ${this.options.EXPORT_PATH || 'Not set'}`);
            console.log(`  DCE_PATH: ${this.options.DCE_PATH || 'Not set'}`);
            console.log('\nAdvanced Settings:');
            console.log(`  DRY_RUN: ${this.options.DRY_RUN}`);
            console.log(`  BATCH_SIZE: ${this.options.BATCH_SIZE}`);
            console.log(`  API_DELAY_MS: ${this.options.API_DELAY_MS}`);
            console.log(`  RATE_LIMIT: ${this.options.RATE_LIMIT_REQUESTS} req/${this.options.RATE_LIMIT_INTERVAL_MS}ms`);
            console.log('\nEnvironment Variables:');
            console.log(`  AUTHORIZATION_TOKEN: ${process.env.AUTHORIZATION_TOKEN ? '***set***' : 'Not set'}`);
            console.log(`  USER_DISCORD_ID: ${process.env.USER_DISCORD_ID || 'Not set'}`);
            console.log('\n1. Edit Data Package Folder');
            console.log('2. Edit Export Path');
            console.log('3. Edit Discord Chat Exporter Path');
            console.log('4. Advanced Settings');
            console.log('5. Reset to Default');
            console.log('q. Back to Main Menu');

            const choice = await getMenuChoice(this.rl);

            try {
                switch (choice) {
                    case '1':
                        await this.editDataPackageFolder();
                        break;
                    case '2':
                        await this.editExportPath();
                        break;
                    case '3':
                        await this.editDCEPath();
                        break;
                    case '4':
                        await this.advancedSettings();
                        break;
                    case '5':
                        await this.resetToDefault();
                        break;
                    case 'q':
                        return;
                    default:
                        console.log('Invalid option. Please try again.');
                }
            } catch (error) {
                console.error('Error:', error.message);
            }
        }
    }

    async editDataPackageFolder() {
        const newValue = cleanInput(await waitForKeyPress(this.rl, `\nData Package Folder (current: ${this.options.DATA_PACKAGE_FOLDER}): `));
        if (newValue) {
            this.options.DATA_PACKAGE_FOLDER = newValue;
            this.configManager.saveConfig();
            console.log('Data package folder updated!');
        }
    }

    async editExportPath() {
        const newValue = await waitForKeyPress(this.rl, `\nExport Path (current: ${this.options.EXPORT_PATH}): `);
        this.options.EXPORT_PATH = ensureExportPath(newValue);
        this.configManager.saveConfig();
        console.log(`Export path set to ${this.options.EXPORT_PATH}`);
    }

    async editDCEPath() {
        const newValue = cleanInput(await waitForKeyPress(this.rl, `\nDiscord Chat Exporter Path (current: ${this.options.DCE_PATH}): `));
        if (newValue) {
            this.options.DCE_PATH = newValue;
            this.configManager.saveConfig();
            console.log('Discord Chat Exporter path updated!');
        }
    }

    async resetToDefault() {
        console.log('\nWARNING: This will delete all configuration and reset to defaults.');
        console.log('This includes:');
        console.log('  - All path settings');
        console.log('  - Advanced settings (will reset to defaults)');
        console.log('  - Environment variables (AUTHORIZATION_TOKEN, USER_DISCORD_ID)');
        
        if (await promptConfirmation('\nAre you sure you want to continue? (yes/no): ', this.rl)) {
            this.configManager.resetToDefault();
            this.options = this.configManager.config;
            console.log('\n✓ Configuration reset successfully!');
            console.log('You will need to reconfigure before using the application.');
            await waitForKeyPress(this.rl);
        } else {
            console.log('Reset cancelled.');
        }
    }

    async advancedSettings() {
        while (true) {
            clearScreen();
            console.log('\nAdvanced Settings');
            console.log('=================');
            console.log('Caution: These settings affect API behavior. Modify carefully.');
            console.log('http://discord.com/developers/docs/topics/rate-limits#global-rate-limit');
            console.log('\nCurrent Values:');
            console.log(`  Dry Run Mode: ${this.options.DRY_RUN ? 'Enabled' : 'Disabled'}`);
            console.log(`  Batch Size: ${this.options.BATCH_SIZE}`);
            console.log(`  API Delay: ${this.options.API_DELAY_MS}ms`);
            console.log(`  Rate Limit: ${this.options.RATE_LIMIT_REQUESTS} requests per ${this.options.RATE_LIMIT_INTERVAL_MS}ms`);
            console.log('\n1. Toggle Dry Run Mode');
            console.log('2. Set Batch Size');
            console.log('3. Set API Delay');
            console.log('4. Set Rate Limit');
            console.log('q. Back to Configuration Menu');

            const choice = await getMenuChoice(this.rl);

            try {
                switch (choice) {
                    case '1':
                        this.toggleDryRun();
                        break;
                    case '2':
                        await this.setBatchSize();
                        break;
                    case '3':
                        await this.setApiDelay();
                        break;
                    case '4':
                        await this.setRateLimit();
                        break;
                    case 'q':
                        return;
                    default:
                        console.log('Invalid option. Please try again.');
                }
            } catch (error) {
                console.error('Error:', error.message);
            }
        }
    }

    async setBatchSize() {
        const newValue = cleanInput(await waitForKeyPress(this.rl, `Enter new batch size (current: ${this.options.BATCH_SIZE}): `));
        if (newValue) {
            this.options.BATCH_SIZE = Number(newValue);
            this.configManager.saveConfig();
            console.log(`Batch size updated to ${this.options.BATCH_SIZE}`);
        }
    }

    async setApiDelay() {
        const newValue = cleanInput(await waitForKeyPress(this.rl, `Enter new API delay in ms (current: ${this.options.API_DELAY_MS}): `));
        if (newValue) {
            this.options.API_DELAY_MS = Number(newValue);
            this.configManager.saveConfig();
            console.log(`API delay updated to ${this.options.API_DELAY_MS}ms`);
        }
    }

    async setRateLimit() {
        console.log('\nRate Limit Configuration');
        const requests = cleanInput(await waitForKeyPress(this.rl, `Requests (current: ${this.options.RATE_LIMIT_REQUESTS}): `));
        const interval = cleanInput(await waitForKeyPress(this.rl, `Interval in ms (current: ${this.options.RATE_LIMIT_INTERVAL_MS}): `));
        
        if (requests) {
            this.options.RATE_LIMIT_REQUESTS = Number(requests);
        }
        if (interval) {
            this.options.RATE_LIMIT_INTERVAL_MS = Number(interval);
        }
        
        this.configManager.saveConfig();
        console.log(`Rate limit updated to ${this.options.RATE_LIMIT_REQUESTS} requests per ${this.options.RATE_LIMIT_INTERVAL_MS}ms`);
    }

    toggleDryRun() {
        this.options.DRY_RUN = !this.options.DRY_RUN;
        this.configManager.saveConfig();
        console.log(`Dry Run Mode ${this.options.DRY_RUN ? 'Enabled' : 'Disabled'}`);
    }

    async initialize() {
        try {
            // Only initialize config if files exist, otherwise let menu handle it
            const configPath = resolveConfigPath('config.json');
            const envPath = resolveConfigPath('.env');
            if (fs.existsSync(configPath) && fs.existsSync(envPath)) {
                await this.configManager.init();
                this.options = this.configManager.config;
                console.log('Configuration loaded successfully.');
            } else {
                console.log('No configuration found. Please configure via menu option 1.');
            }
        } catch (error) {
            console.error('Error during initialization:', error.message);
        }
    }

    async ensureConfigured() {
        if (!this.configManager.initialized) {
            console.log('\nConfiguration required before this operation.');
            if (await promptConfirmation('Would you like to configure now? (yes/no): ', this.rl)) {
                await this.configManager.init();
                this.options = this.configManager.config;
                
                // Show the configuration after setup
                console.log('\nConfiguration Complete!');
                console.log('======================');
                console.log('\nPath Settings:');
                console.log(`  DATA_PACKAGE_FOLDER: ${this.options.DATA_PACKAGE_FOLDER || 'Not set'}`);
                console.log(`  EXPORT_PATH: ${this.options.EXPORT_PATH || 'Not set'}`);
                console.log(`  DCE_PATH: ${this.options.DCE_PATH || 'Not set'}`);
                console.log('\nAdvanced Settings:');
                console.log(`  DRY_RUN: ${this.options.DRY_RUN}`);
                console.log(`  BATCH_SIZE: ${this.options.BATCH_SIZE}`);
                console.log(`  API_DELAY_MS: ${this.options.API_DELAY_MS}`);
                console.log('\nReturning to main menu...');
                
                // Throw error to prevent operation and return to main menu
                throw new Error('CONFIG_COMPLETE');
            } else {
                throw new Error('Configuration required. Please use option 1 to configure.');
            }
        }
        
        // Check for AUTHORIZATION_TOKEN if not in DRY_RUN mode
        if (!this.options.DRY_RUN && !process.env.AUTHORIZATION_TOKEN) {
            console.log('\nAUTHORIZATION_TOKEN is not set!');
            console.log('You need to set your Discord authorization token before making API calls.');
            console.log('Please configure it in the Configuration menu (option 1) or enable DRY_RUN mode.');
            throw new Error('AUTHORIZATION_TOKEN required for API operations. Enable DRY_RUN mode or set token in configuration.');
        }
    }
}

(async () => {
    const app = new DiscordDMApp();
    try {
        await app.initialize();
        await app.showMenu();
    } catch (error) {
        console.error('Initialization error:', error.message);
        process.exit(1);
    }
})();

const { resolveConfigPath, ensureExportPath } = require('../lib/file-utils');
const { promptUser, waitForKeyPress, getMenuChoice, clearScreen, cleanInput, promptConfirmation } = require('../lib/cli-helpers');
const { displayDetailedConfig, displayAdvancedSettings } = require('./menu-helpers');

class ConfigurationMenu {
    constructor(rl, configManager) {
        this.rl = rl;
        this.configManager = configManager;
        this.options = configManager.config;
    }

    async show() {
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
            displayDetailedConfig(this.options);
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
        const newValue = cleanInput(await promptUser(`\nData Package Folder (current: ${this.options.DATA_PACKAGE_FOLDER}): `, this.rl));
        if (newValue) {
            this.options.DATA_PACKAGE_FOLDER = newValue;
            this.configManager.saveConfig();
            console.log('Data package folder updated!');
        }
    }

    async editExportPath() {
        const newValue = cleanInput(await promptUser(`\nExport Path (current: ${this.options.EXPORT_PATH}): `, this.rl));
        this.options.EXPORT_PATH = ensureExportPath(newValue);
        this.configManager.saveConfig();
        console.log(`Export path set to ${this.options.EXPORT_PATH}`);
    }

    async editDCEPath() {
        const newValue = cleanInput(await promptUser(`\nDiscord Chat Exporter Path (current: ${this.options.DCE_PATH}): `, this.rl));
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
            displayAdvancedSettings(this.options);
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
        const newValue = cleanInput(await promptUser(`Enter new batch size (current: ${this.options.BATCH_SIZE}): `, this.rl));
        if (newValue) {
            this.options.BATCH_SIZE = Number(newValue);
            this.configManager.saveConfig();
            console.log(`Batch size updated to ${this.options.BATCH_SIZE}`);
        }
    }

    async setApiDelay() {
        const newValue = cleanInput(await promptUser(`Enter new API delay in ms (current: ${this.options.API_DELAY_MS}): `, this.rl));
        if (newValue) {
            this.options.API_DELAY_MS = Number(newValue);
            this.configManager.saveConfig();
            console.log(`API delay updated to ${this.options.API_DELAY_MS}ms`);
        }
    }

    async setRateLimit() {
        console.log('\nRate Limit Configuration');
        const requests = cleanInput(await promptUser(`Requests (current: ${this.options.RATE_LIMIT_REQUESTS}): `, this.rl));
        const interval = cleanInput(await promptUser(`Interval in ms (current: ${this.options.RATE_LIMIT_INTERVAL_MS}): `, this.rl));
        
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
}

module.exports = { ConfigurationMenu };

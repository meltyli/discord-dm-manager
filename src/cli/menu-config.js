const { ensureExportPath } = require('../lib/file-utils');
const { promptUser, waitForKeyPress, cleanInput, promptConfirmation } = require('../lib/cli-helpers');
const { displayDetailedConfig, displayAdvancedSettings } = require('./menu-helpers');
const { MenuBase } = require('./menu-base');

class ConfigurationMenu extends MenuBase {
    constructor(rl, configManager) {
        super(rl, configManager);
    }

    async show() {
        if (!this.configManager.initialized) {
            console.log('\nStarting initial configuration...\n');
            await this.configManager.init();
            console.log('\nConfiguration complete!');
            await waitForKeyPress(this.rl);
            return;
        }

        await this.runMenuLoop('Configuration Menu', () => {
            console.log('\nConfiguration');
            console.log('=============');
            displayDetailedConfig(this.options);
            console.log('\n1. Edit Data Package Folder');
            console.log('2. Edit Export Path');
            console.log('3. Edit Discord Chat Exporter Path');
            console.log('4. Advanced Settings');
            console.log('5. Reset to Default');
            console.log('q. Back to Main Menu');
        }, async (choice) => {
            switch (choice) {
                case '1':
                    return await this.executeMenuAction('Edit Data Package Folder', 
                        () => this.editDataPackageFolder(), false);
                case '2':
                    return await this.executeMenuAction('Edit Export Path', 
                        () => this.editExportPath(), false);
                case '3':
                    return await this.executeMenuAction('Edit Discord Chat Exporter Path', 
                        () => this.editDCEPath(), false);
                case '4':
                    return await this.executeMenuAction('Advanced Settings', 
                        () => this.advancedSettings(), false);
                case '5':
                    return await this.executeMenuAction('Reset to Default', 
                        () => this.resetToDefault(), false);
                case 'q':
                    return false;
                default:
                    console.log('\nInvalid option. Please try again.');
                    await waitForKeyPress(this.rl);
                    return true;
            }
        });
    }

    async editDataPackageFolder() {
        const newValue = cleanInput(await promptUser(`Data Package Folder (current: ${this.options.DATA_PACKAGE_FOLDER}): `, this.rl));
        if (newValue) {
            this.options.DATA_PACKAGE_FOLDER = newValue;
            this.configManager.saveConfig();
            console.log('\nData package folder updated!');
        }
        await waitForKeyPress(this.rl);
    }

    async editExportPath() {
        const newValue = cleanInput(await promptUser(`Export Path (current: ${this.options.EXPORT_PATH}): `, this.rl));
        this.options.EXPORT_PATH = ensureExportPath(newValue);
        this.configManager.saveConfig();
        console.log(`\nExport path set to ${this.options.EXPORT_PATH}`);
        await waitForKeyPress(this.rl);
    }

    async editDCEPath() {
        const newValue = cleanInput(await promptUser(`Discord Chat Exporter Path (current: ${this.options.DCE_PATH}): `, this.rl));
        if (newValue) {
            this.options.DCE_PATH = newValue;
            this.configManager.saveConfig();
            console.log('\nDiscord Chat Exporter path updated!');
        }
        await waitForKeyPress(this.rl);
    }

    async resetToDefault() {
        console.log('WARNING: This will delete all configuration and reset to defaults.');
        console.log('This includes:');
        console.log('  - All path settings');
        console.log('  - Advanced settings (will reset to defaults)');
        console.log('  - Environment variables (AUTHORIZATION_TOKEN, USER_DISCORD_ID)');
        console.log('');
        
        if (await promptConfirmation('Are you sure you want to continue? (yes/no): ', this.rl)) {
            this.configManager.resetToDefault();
            this.options = this.configManager.config;
            console.log('\n✓ Configuration reset successfully!');
            console.log('You will need to reconfigure before using the application.');
            await waitForKeyPress(this.rl);
        } else {
            console.log('\nReset cancelled.');
            await waitForKeyPress(this.rl);
        }
    }

    async advancedSettings() {
        await this.runMenuLoop('Advanced Settings', () => {
            displayAdvancedSettings(this.options);
            console.log('\n1. Toggle Dry Run Mode');
            console.log('2. Set Batch Size');
            console.log('3. Set API Delay');
            console.log('4. Set Rate Limit');
            console.log('5. Toggle Suppress Menu Errors');
            console.log('q. Back to Configuration Menu');
        }, async (choice) => {
            switch (choice) {
                case '1':
                    return await this.executeMenuAction('Toggle Dry Run Mode', 
                        () => this.toggleDryRun(), false);
                case '2':
                    return await this.executeMenuAction('Set Batch Size', 
                        () => this.setBatchSize(), false);
                case '3':
                    return await this.executeMenuAction('Set API Delay', 
                        () => this.setApiDelay(), false);
                case '4':
                    return await this.executeMenuAction('Set Rate Limit', 
                        () => this.setRateLimit(), false);
                case '5':
                    return await this.executeMenuAction('Toggle Suppress Menu Errors', 
                        () => this.toggleSuppressMenuErrors(), false);
                case 'q':
                    return false;
                default:
                    console.log('\nInvalid option. Please try again.');
                    await waitForKeyPress(this.rl);
                    return true;
            }
        });
    }

    async setBatchSize() {
        const newValue = cleanInput(await promptUser(`Enter new batch size (current: ${this.options.BATCH_SIZE}): `, this.rl));
        if (newValue) {
            this.options.BATCH_SIZE = Number(newValue);
            this.configManager.saveConfig();
            console.log(`\nBatch size updated to ${this.options.BATCH_SIZE}`);
        }
        await waitForKeyPress(this.rl);
    }

    async setApiDelay() {
        const newValue = cleanInput(await promptUser(`Enter new API delay in ms (current: ${this.options.API_DELAY_MS}): `, this.rl));
        if (newValue) {
            this.options.API_DELAY_MS = Number(newValue);
            this.configManager.saveConfig();
            console.log(`\nAPI delay updated to ${this.options.API_DELAY_MS}ms`);
        }
        await waitForKeyPress(this.rl);
    }

    async setRateLimit() {
        console.log('Rate Limit Configuration');
        const requests = cleanInput(await promptUser(`Requests (current: ${this.options.RATE_LIMIT_REQUESTS}): `, this.rl));
        const interval = cleanInput(await promptUser(`Interval in ms (current: ${this.options.RATE_LIMIT_INTERVAL_MS}): `, this.rl));
        
        if (requests) {
            this.options.RATE_LIMIT_REQUESTS = Number(requests);
        }
        if (interval) {
            this.options.RATE_LIMIT_INTERVAL_MS = Number(interval);
        }
        
        this.configManager.saveConfig();
        console.log(`\nRate limit updated to ${this.options.RATE_LIMIT_REQUESTS} requests per ${this.options.RATE_LIMIT_INTERVAL_MS}ms`);
        await waitForKeyPress(this.rl);
    }

    async toggleDryRun() {
        this.options.DRY_RUN = !this.options.DRY_RUN;
        this.configManager.saveConfig();
        console.log(`\nDry Run Mode ${this.options.DRY_RUN ? 'Enabled' : 'Disabled'}`);
        await waitForKeyPress(this.rl);
    }

    async toggleSuppressMenuErrors() {
        this.options.SUPPRESS_MENU_ERRORS = !this.options.SUPPRESS_MENU_ERRORS;
        this.configManager.saveConfig();
        console.log(`\nSuppress Menu Errors ${this.options.SUPPRESS_MENU_ERRORS ? 'Enabled' : 'Disabled'}`);
        console.log('(Reduces duplicate error messages in menu output)');
        await waitForKeyPress(this.rl);
    }
}

module.exports = { ConfigurationMenu };

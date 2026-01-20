const { promptUser, waitForKeyPress, cleanInput, promptConfirmation } = require('../lib/cli-helpers');
const { displayDetailedConfig } = require('./menu-helpers');
const { MenuBase } = require('./menu-base');
const { validatePathExists, validateDataPackage } = require('../lib/validators');

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
            console.log('\n1. Check Data Package');
            console.log('2. Toggle Dry Run Mode');
            console.log('3. Set Batch Size');
            console.log('4. Set API Delay');
            console.log('5. Set Rate Limit');
            console.log('6. Toggle Suppress Menu Errors');
            console.log('7. Reset to Default');
            console.log('q. Back to Main Menu');
        }, async (choice) => {
            switch (choice) {
                case '1':
                    return await this.executeMenuAction('Check Data Package', 
                        () => this.checkDataPackage(), false);
                case '2':
                    return await this.executeMenuAction('Toggle Dry Run Mode', 
                        () => this.toggleDryRun(), false);
                case '3':
                    return await this.executeMenuAction('Set Batch Size', 
                        () => this.setBatchSize(), false);
                case '4':
                    return await this.executeMenuAction('Set API Delay', 
                        () => this.setApiDelay(), false);
                case '5':
                    return await this.executeMenuAction('Set Rate Limit', 
                        () => this.setRateLimit(), false);
                case '6':
                    return await this.executeMenuAction('Toggle Suppress Menu Errors', 
                        () => this.toggleSuppressMenuErrors(), false);
                case '7':
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

    async resetToDefault() {
        console.log('WARNING: This will delete all configuration and reset to defaults.');
        console.log('This includes:');
        console.log('  - Settings (will reset to defaults)');
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

    async checkDataPackage() {
        console.log('\n' + '='.repeat(60));
        console.log('Checking Data Package');
        console.log('='.repeat(60));
        
        const dataPackagePath = this.options.DATA_PACKAGE_FOLDER;
        console.log(`\nChecking: ${dataPackagePath}`);
        
        if (!validatePathExists(dataPackagePath)) {
            console.log('✗ Path does not exist');
            console.log('\n📦 Setup Instructions:');
            
            const isDocker = require('fs').existsSync('/.dockerenv');
            if (isDocker) {
                console.log('1. Place your Discord data package in: ./datapackage/ (on host)');
                console.log('   It should contain: messages/, account/, servers/, etc.');
                console.log('2. Or edit docker-compose.yml to mount your custom path');
                console.log('3. Rebuild: docker-compose down && docker-compose build');
            } else {
                console.log('1. Download your Discord data package from Discord settings');
                console.log('2. Extract it to: ' + dataPackagePath);
                console.log('   It should contain: messages/, account/, servers/, etc.');
            }
            await waitForKeyPress(this.rl);
            return;
        }
        
        try {
            validateDataPackage(dataPackagePath);
            console.log('✓ Valid data package found!');
            console.log('\nPackage contains:');
            
            const fs = require('fs');
            const path = require('path');
            const messagesPath = path.join(dataPackagePath, 'messages');
            if (fs.existsSync(messagesPath)) {
                const channels = fs.readdirSync(messagesPath).filter(f => {
                    const stat = fs.statSync(path.join(messagesPath, f));
                    return stat.isDirectory() && f.startsWith('c');
                });
                console.log(`  - Messages: ${channels.length} channels found`);
            }
            
            const accountPath = path.join(dataPackagePath, 'account');
            if (fs.existsSync(accountPath)) {
                console.log('  - Account: ✓');
            }
            
            console.log('\n✓ Data package is ready to use!');
        } catch (error) {
            console.log(`✗ Invalid data package: ${error.message}`);
            console.log('\nMake sure your data package contains:');
            console.log('  - messages/ folder with channel data');
            console.log('  - account/ folder (optional but recommended)');
        }
        
        await waitForKeyPress(this.rl);
    }
}

module.exports = { ConfigurationMenu };

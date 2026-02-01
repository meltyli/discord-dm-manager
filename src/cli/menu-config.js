const { promptUser, waitForKeyPress, cleanInput, promptConfirmation } = require('../lib/cli-helpers');
const { displayDetailedConfig } = require('./menu-helpers');
const { MenuBase } = require('./menu-base');
const { validatePathExists, validateDataPackage, validateUserJson } = require('../lib/validators');
const { red, green, yellow, reset } = require('../lib/colors');
const { getMessagesPath, getAccountPath, getUserJsonPath } = require('../lib/path-utils');

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
        console.log(`${red}WARNING:${reset} This will delete all configuration and reset to defaults.`);
        console.log('This includes:');
        console.log('  - Settings (will reset to defaults)');
        console.log('  - Environment variables (AUTHORIZATION_TOKEN, USER_DISCORD_ID)');
        console.log('');
        
        if (await promptConfirmation('Are you sure you want to continue? (yes/no): ', this.rl)) {
            this.configManager.resetToDefault();
            this.options = this.configManager.config;
            const green = '\x1b[32m';
            const reset = '\x1b[0m';
            console.log(`\n${green}✓ Configuration reset successfully!${reset}`);
            console.log('You will need to reconfigure before using the application.');
            await waitForKeyPress(this.rl);
        } else {
            console.log('\nReset cancelled.');
            await waitForKeyPress(this.rl);
        }
    }

    async setBatchSize() {
        console.log(`${yellow}Batch Size Configuration${reset}`);
        const newValue = cleanInput(await promptUser(`Enter new batch size (current: ${yellow}${this.options.BATCH_SIZE}${reset}): `, this.rl));
        if (newValue) {
            this.options.BATCH_SIZE = Number(newValue);
            this.configManager.saveConfig();
            console.log(`\nBatch size updated to ${yellow}${this.options.BATCH_SIZE}${reset}`);
        }
        await waitForKeyPress(this.rl);
    }

    async setApiDelay() {
        console.log(`${yellow}API Delay Configuration${reset}`);
        const newValue = cleanInput(await promptUser(`Enter new API delay in ms (current: ${yellow}${this.options.API_DELAY_MS}${reset}): `, this.rl));
        if (newValue) {
            this.options.API_DELAY_MS = Number(newValue);
            this.configManager.saveConfig();
            console.log(`\nAPI delay updated to ${yellow}${this.options.API_DELAY_MS}${reset}ms`);
        }
        await waitForKeyPress(this.rl);
    }

    async setRateLimit() {
        console.log(`${yellow}Rate Limit Configuration${reset}`);
        const requests = cleanInput(await promptUser(`Requests (current: ${yellow}${this.options.RATE_LIMIT_REQUESTS}${reset}): `, this.rl));
        const interval = cleanInput(await promptUser(`Interval in ms (current: ${yellow}${this.options.RATE_LIMIT_INTERVAL_MS}${reset}): `, this.rl));
        
        if (requests) {
            this.options.RATE_LIMIT_REQUESTS = Number(requests);
        }
        if (interval) {
            this.options.RATE_LIMIT_INTERVAL_MS = Number(interval);
        }
        
        this.configManager.saveConfig();
        console.log(`\nRate limit updated to ${yellow}${this.options.RATE_LIMIT_REQUESTS}${reset} requests per ${yellow}${this.options.RATE_LIMIT_INTERVAL_MS}${reset}ms`);
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
        console.log(`${yellow}Checking Data Package${reset}`);
        console.log('='.repeat(60));
        
        const dataPackagePath = this.options.DATA_PACKAGE_FOLDER;
        console.log(`\nChecking: ${yellow}${dataPackagePath}${reset}`);
        
        if (!validatePathExists(dataPackagePath)) {
            console.log('✗ Path does not exist');
            console.log(`\n${yellow}Setup Instructions:${reset}`);
            
            const isDocker = require('fs').existsSync('/.dockerenv');
            if (isDocker) {
                console.log('1. Place your Discord data package in: ./data/package/ (on host)');
                console.log('   It should contain: messages/, account/, servers/, etc.');
                console.log('2. Or edit docker-compose.yml to mount your custom path');
                console.log('3. Rebuild: docker compose down && docker compose build');
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
            console.log(`${green}✓ Valid data package found!${reset}`);
            console.log(`\n${yellow}Package contains:${reset}`);
            
            const fs = require('fs');
            const path = require('path');
            const messagesPath = getMessagesPath(dataPackagePath);
            if (fs.existsSync(messagesPath)) {
                const channels = fs.readdirSync(messagesPath).filter(f => {
                    const stat = fs.statSync(path.join(messagesPath, f));
                    return stat.isDirectory() && f.startsWith('c');
                });
                console.log(`  - Messages: ${yellow}${channels.length}${reset} channels found`);
            }
            
            const accountPath = getAccountPath(dataPackagePath);
            if (fs.existsSync(accountPath)) {
                console.log('  - Account: ✓');
            }
            
            // Check user ID match
            console.log(`\n${yellow}User ID Verification:${reset}`);
            const configuredUserId = process.env.USER_DISCORD_ID;
            
            if (!configuredUserId) {
                console.log(`  ${red}Warning:${reset} No user ID configured yet`);
                console.log('  Run configuration setup to set your user ID');
            } else {
                const userJsonPath = getUserJsonPath(dataPackagePath);
                const validation = validateUserJson(userJsonPath);
                
                if (!validation.valid) {
                    console.log(`  ${red}Warning:${reset} ${validation.error}`);
                    console.log(`  Configured ID: ${yellow}${configuredUserId}${reset}`);
                } else {
                    const { userId: packageUserId, username: packageUsername } = validation;
                    console.log(`  Package user: ${yellow}${packageUsername}${reset} (ID: ${yellow}${packageUserId}${reset})`);
                    console.log(`  Configured ID: ${yellow}${configuredUserId}${reset}`);
                    
                    if (configuredUserId === packageUserId) {
                        console.log(`  ${green}✓ User ID matches!${reset}`);
                    } else {
                        console.log(`  ${red}✗ Warning:${reset} User ID mismatch!`);
                        console.log('  This may cause issues with DM exports.');
                        console.log('  Consider resetting configuration to update user ID.');
                    }
                }
            }
            
            console.log(`\n${green}✓ Data package is ready to use!${reset}`);
        } catch (error) {
            console.log(`${red}✗ Invalid data package:${reset} ${error.message}`);
            console.log(`\n${yellow}Make sure your data package contains:${reset}`);
            console.log('  - messages/ folder with channel data');
            console.log('  - account/ folder (optional but recommended)');
        }
        
        await waitForKeyPress(this.rl);
    }
}

module.exports = { ConfigurationMenu };

const fs = require('fs');
const readline = require('readline');
const { initializeLogger } = require('./logger');
const { MessageParser } = require('./parse-messages');
const {
    getCurrentOpenDMs,
    closeDM,
    reopenDM
} = require('./discord-api');
const { saveOpenDMsToFile } = require('./discord-dm-manager');
const { getConfigManager } = require('./config');

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

    async question(query) {
        return new Promise((resolve) => {
            this.rl.question(query, resolve);
        });
    }

    async showMenu() {
        while (true) {
            console.clear();
            console.log('\nDiscord DM Manager');
            console.log('=================');
            console.log('1. Process Recent Messages and Reopen DMs');
            console.log('2. View Current Open DMs');
            console.log('3. Close All Open DMs');
            console.log('4. Reopen DM with Specific User');
            console.log('5. Configuration');
            console.log('q. Exit');
            console.log('\nCurrent Settings:');
            console.log(`- Dry Run Mode: ${this.options.DRY_RUN ? 'Enabled' : 'Disabled'}`);

            const choice = await this.question('\nSelect an option: ');

            try {
                switch (choice.trim().toLowerCase()) {
                    case '1':
                        await this.processRecentMessages();
                        break;
                    case '2':
                        await this.viewOpenDMs();
                        break;
                    case '3':
                        await this.closeAllDMs();
                        break;
                    case '4':
                        await this.reopenSpecificDM();
                        break;
                    case '5':
                        await this.configurationMenu();
                        break;
                    case 'q':
                        console.log('Goodbye!');
                        this.rl.close();
                        return;
                    default:
                        console.log('Invalid option. Please try again.');
                }
            } catch (error) {
                // Don't show error if it's just config completion
                if (error.message !== 'CONFIG_COMPLETE') {
                    console.error('Error:', error.message);
                }
            }

            await this.question('\nPress Enter to continue...');
        }
    }

    async processRecentMessages() {
        await this.ensureConfigured();
        
        console.log('\nProcessing recent messages...');
        
        const parser = new MessageParser(this.options.DATA_PACKAGE_FOLDER);
        const messages = await parser.processAllChannels();
        
        console.log(`Found ${messages.length} recent messages`);
        
        if (!this.options.DRY_RUN) {
            console.log('Reopening DMs...');
            await parser.reopenDMs(process.env.AUTHORIZATION_TOKEN);
            console.log('DMs reopened successfully!');
        } else {
            console.log('[DRY RUN] Would have reopened DMs with these users:');
            const uniqueUsers = new Set(messages.map(m => m.recipientId));
            console.log(Array.from(uniqueUsers));
        }
    }

    async viewOpenDMs() {
        await this.ensureConfigured();
        
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
        
        console.log('\nClosing all open DMs...');
        const dms = await getCurrentOpenDMs(process.env.AUTHORIZATION_TOKEN);
        
        if (this.options.DRY_RUN) {
            console.log(`[DRY RUN] Would close ${dms.length} DMs`);
            return;
        }

        for (const dm of dms) {
            if (dm.type === 1) {
                console.log(`Closing DM channel: ${dm.id}`);
                await closeDM(process.env.AUTHORIZATION_TOKEN, dm.id);
                await new Promise(resolve => setTimeout(resolve, this.options.API_DELAY_MS));
            }
        }
        console.log('All DMs closed successfully!');
    }

    async reopenSpecificDM() {
        await this.ensureConfigured();
        
        const userId = await this.question('\nEnter Discord User ID: ');
        
        if (this.options.DRY_RUN) {
            console.log(`[DRY RUN] Would reopen DM with user ${userId}`);
            return;
        }

        try {
            await reopenDM(process.env.AUTHORIZATION_TOKEN, userId);
            console.log('DM reopened successfully!');
        } catch (error) {
            console.error('Failed to reopen DM:', error.message);
        }
    }

    async configurationMenu() {
        if (!this.configManager.initialized) {
            console.log('\nStarting initial configuration...\n');
            await this.configManager.init();
            this.options = this.configManager.config;
            console.log('\nConfiguration complete!');
            await this.question('\nPress Enter to continue...');
            return;
        }

        while (true) {
            console.clear();
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

            const choice = await this.question('\nSelect an option: ');

            try {
                switch (choice.trim().toLowerCase()) {
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
                        await this.question('\nPress Enter to continue...');
                }
            } catch (error) {
                console.error('Error:', error.message);
                await this.question('\nPress Enter to continue...');
            }
        }
    }

    async editDataPackageFolder() {
        const newValue = await this.question(`\nData Package Folder (current: ${this.options.DATA_PACKAGE_FOLDER}): `);
        if (newValue.trim()) {
            this.options.DATA_PACKAGE_FOLDER = newValue;
            this.configManager.saveConfig();
            console.log('Data package folder updated!');
        }
    }

    async editExportPath() {
        const newValue = await this.question(`\nExport Path (current: ${this.options.EXPORT_PATH}): `);
        if (newValue.trim()) {
            this.options.EXPORT_PATH = newValue;
            this.configManager.saveConfig();
            console.log('Export path updated!');
        }
    }

    async editDCEPath() {
        const newValue = await this.question(`\nDiscord Chat Exporter Path (current: ${this.options.DCE_PATH}): `);
        if (newValue.trim()) {
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
        const confirm = await this.question('\nAre you sure you want to continue? (yes/no): ');
        
        if (confirm.trim().toLowerCase() === 'yes' || confirm.trim().toLowerCase() === 'y') {
            this.configManager.resetToDefault();
            this.options = this.configManager.config;
            console.log('\n✓ Configuration reset successfully!');
            console.log('You will need to reconfigure before using the application.');
            await this.question('\nPress Enter to continue...');
            return; // Exit config menu to force reconfiguration
        } else {
            console.log('Reset cancelled.');
        }
    }

    async advancedSettings() {
        while (true) {
            console.clear();
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

            const choice = await this.question('\nSelect an option: ');

            try {
                switch (choice.trim().toLowerCase()) {
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

            await this.question('\nPress Enter to continue...');
        }
    }

    async setBatchSize() {
        const newValue = await this.question(`Enter new batch size (current: ${this.options.BATCH_SIZE}): `);
        if (newValue.trim()) {
            this.options.BATCH_SIZE = Number(newValue);
            this.configManager.saveConfig();
            console.log(`Batch size updated to ${this.options.BATCH_SIZE}`);
        }
    }

    async setApiDelay() {
        const newValue = await this.question(`Enter new API delay in ms (current: ${this.options.API_DELAY_MS}): `);
        if (newValue.trim()) {
            this.options.API_DELAY_MS = Number(newValue);
            this.configManager.saveConfig();
            console.log(`API delay updated to ${this.options.API_DELAY_MS}ms`);
        }
    }

    async setRateLimit() {
        console.log('\nRate Limit Configuration');
        const requests = await this.question(`Requests (current: ${this.options.RATE_LIMIT_REQUESTS}): `);
        const interval = await this.question(`Interval in ms (current: ${this.options.RATE_LIMIT_INTERVAL_MS}): `);
        
        if (requests.trim()) {
            this.options.RATE_LIMIT_REQUESTS = Number(requests);
        }
        if (interval.trim()) {
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
            const configPath = require('path').join(__dirname, '..', 'config', 'config.json');
            const envPath = require('path').join(__dirname, '..', 'config', '.env');
            if (fs.existsSync(configPath) && fs.existsSync(envPath)) {
                await this.configManager.init();
                this.options = this.configManager.config;
                console.log('Configuration loaded successfully.');
            } else {
                console.log('No configuration found. Please configure via menu option 5.');
            }
        } catch (error) {
            console.error('Error during initialization:', error.message);
        }
    }

    async ensureConfigured() {
        if (!this.configManager.initialized) {
            console.log('\nConfiguration required before this operation.');
            const configure = await this.question('Would you like to configure now? (yes/no): ');
            if (configure.toLowerCase() === 'yes' || configure.toLowerCase() === 'y') {
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
                throw new Error('Configuration required. Please use option 5 to configure.');
            }
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

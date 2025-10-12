const fs = require('fs');
const readline = require('readline');
const { initializeLogger } = require('../logger');
const { getConfigManager } = require('../config');
const { resolveConfigPath } = require('../lib/file-utils');
const { waitForKeyPress, getMenuChoice, clearScreen, promptConfirmation } = require('../lib/cli-helpers');
const { displaySettings, displayDetailedConfig } = require('./menu-helpers');
const { ConfigurationMenu } = require('./menu-config');
const { ApiMenu } = require('./menu-api');

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
        
        // Create menu instances
        this.configMenu = new ConfigurationMenu(this.rl, this.configManager);
        this.apiMenu = new ApiMenu(this.rl, this.configManager, this.ensureConfigured.bind(this));
    }

    async showMenu() {
        while (true) {
            clearScreen();
            console.log('\nDiscord DM Manager');
            console.log('=================');
            console.log('1. Configuration');
            console.log('2. Discord API');
            console.log('q. Exit');
            displaySettings(this.options);

            const choice = await getMenuChoice(this.rl);

            try {
                switch (choice) {
                    case '1':
                        await this.configMenu.show();
                        // Refresh options after config changes
                        this.options = this.configManager.config;
                        break;
                    case '2':
                        // Ensure API menu has latest options
                        this.apiMenu.options = this.configManager.config;
                        await this.apiMenu.show();
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
                displayDetailedConfig(this.options);
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

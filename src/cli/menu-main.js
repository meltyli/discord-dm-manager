const fs = require('fs');
const readline = require('readline');
const { initializeLogger, getLogger } = require('../logger');
const { getConfigManager } = require('../config');
const { resolveConfigPath } = require('../lib/file-utils');
const { waitForKeyPress, getMenuChoice, clearScreen, promptConfirmation } = require('../lib/cli-helpers');
const { displaySettings, displayDetailedConfig } = require('./menu-helpers');
const { ConfigurationMenu } = require('./menu-config');
const { ApiMenu } = require('./menu-api');
const { red, green, yellow, reset } = require('../lib/colors');

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
        
        // Create menu instances
        this.configMenu = new ConfigurationMenu(this.rl, this.configManager);
        this.apiMenu = new ApiMenu(this.rl, this.configManager, this.ensureConfigured.bind(this));
    }

    get options() {
        return this.configManager.config;
    }

    async showMenu() {
        while (true) {
            clearScreen();
            getLogger().logOnly('[MENU] Main Menu');
            
            getLogger().pause(); // Pause logging for menu display
            console.log('\nDiscorDManager');
            console.log('=================');
            console.log('1. Configuration');
            console.log('2. Discord API');
            console.log('q. Exit');
            displaySettings(this.options);
            getLogger().resume(); // Resume logging

            const choice = await getMenuChoice(this.rl);

            try {
                switch (choice) {
                    case '1':
                        getLogger().logOnly('[ACTION] Configuration Menu Selected');
                        await this.configMenu.show();
                        break;
                    case '2':
                        getLogger().logOnly('[ACTION] Discord API Menu Selected');
                        await this.apiMenu.show();
                        break;
                    case 'q':
                        console.log('\nGoodbye!');
                        this.rl.close();
                        return;
                    default:
                        console.log('\nInvalid option. Please try again.');
                        await waitForKeyPress(this.rl);
                }
            } catch (error) {
                // Don't show error if it's just config completion
                if (error.message !== 'CONFIG_COMPLETE') {
                    console.error('\nError:', error.message);
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
                console.log(`${green}Configuration loaded successfully.${reset}`);
            } else {
                console.log(`${yellow}No configuration found.${reset} Please configure via menu option 1.`);
            }
        } catch (error) {
            console.error('Error during initialization:', error.message);
        }
    }

    async ensureConfigured() {
        if (!this.configManager.initialized) {
            console.log(`\n${yellow}Configuration required${reset} before this operation.`);
            if (await promptConfirmation('Would you like to configure now? (yes/no): ', this.rl)) {
                await this.configManager.init();
                
                // Show the configuration after setup
                console.log(`\n${green}Configuration Complete!${reset}`);
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
            console.log(`\n${red}AUTHORIZATION_TOKEN is not set!${reset}`);
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

const fs = require('fs');
const readline = require('readline');
const { MessageParser } = require('./parse-messages');
const {
    getCurrentOpenDMs,
    closeDM,
    reopenDM
} = require('./discord-api');
const { saveOpenDMsToFile } = require('./discord-dm-manager');
const { getConfigManager } = require('./config');

class DiscordDMApp {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        this.configManager = getConfigManager();
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
            console.log('5. Edit Configuration');
            console.log('6. Toggle Dry Run Mode');
            console.log('7. Exit');
            console.log('\nCurrent Settings:');
            console.log(`- Dry Run Mode: ${this.options.DRY_RUN ? 'Enabled' : 'Disabled'}`);
            console.log(`- Batch Size: ${this.options.BATCH_SIZE}`);
            console.log(`- API Delay: ${this.options.API_DELAY_MS}ms`);

            const choice = await this.question('\nSelect an option (1-7): ');

            try {
                switch (choice.trim()) {
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
                        await this.editConfiguration();
                        break;
                    case '6':
                        this.toggleDryRun();
                        break;
                    case '7':
                        console.log('Goodbye!');
                        this.rl.close();
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

    async processRecentMessages() {
        console.log('\nProcessing recent messages...');
        
        await this.configManager.init();
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

    async editConfiguration() {
        console.log('\nCurrent Configuration:');
        for (const [key, value] of Object.entries(this.options)) {
            console.log(`${key}: ${value}`);
        }

        console.log('\nEnter new values (or press Enter to keep current value):');
        
        for (const [key, value] of Object.entries(this.options)) {
            const newValue = await this.question(`${key} (current: ${value}): `);
            if (newValue.trim()) {
                if (typeof value === 'boolean') {
                    this.options[key] = newValue.toLowerCase() === 'true';
                } else if (typeof value === 'number') {
                    this.options[key] = Number(newValue);
                } else {
                    this.options[key] = newValue;
                }
            }
        }

        this.configManager.saveConfig();
    }

    toggleDryRun() {
        this.options.DRY_RUN = !this.options.DRY_RUN;
        this.configManager.saveConfig();
        console.log(`Dry Run Mode ${this.options.DRY_RUN ? 'Enabled' : 'Disabled'}`);
    }

    async initialize() {
        try {
            await this.configManager.init();
            console.log('Saving list of currently open DMs...');
            await saveOpenDMsToFile(); // Updated to use the function from discord-dm-manager
        } catch (error) {
            console.error('Error during initialization:', error.message);
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

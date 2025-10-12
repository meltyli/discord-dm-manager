const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');
const { initializeLogger } = require('./logger');
const { MessageParser } = require('./parse-messages');
const {
    getCurrentOpenDMs,
    closeDM,
    reopenDM
} = require('./discord-api');
const { saveOpenDMsToFile, processDMsInBatches, loadBatchState, clearBatchState, hasIncompleteBatchSession } = require('./discord-dm-manager');
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
            console.log('1. Configuration');
            console.log('2. Discord API');
            console.log('q. Exit');
            console.log('\nCurrent Settings:');
            console.log(`- Dry Run Mode: ${this.options.DRY_RUN ? 'Enabled' : 'Disabled'}`);

            const choice = await this.question('\nSelect an option: ');

            try {
                switch (choice.trim().toLowerCase()) {
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
                        await this.question('\nPress Enter to continue...');
                }
            } catch (error) {
                // Don't show error if it's just config completion
                if (error.message !== 'CONFIG_COMPLETE') {
                    console.error('Error:', error.message);
                    await this.question('\nPress Enter to continue...');
                }
            }
        }
    }

    async discordApiMenu() {
        while (true) {
            console.clear();
            console.log('\nDiscord API');
            console.log('===========');
            console.log('1. Process Recent Messages and Reopen DMs');
            console.log('2. View Current Open DMs');
            console.log('3. Close All Open DMs');
            console.log('4. Reopen DM with Specific User');
            console.log('5. Run Batch DM Processing');
            console.log('6. Export Open DMs');
            console.log('7. Resume Last Batch Session');
            console.log('q. Back to Main Menu');
            console.log('\nCurrent Settings:');
            console.log(`- Dry Run Mode: ${this.options.DRY_RUN ? 'Enabled' : 'Disabled'}`);
            
            // Show incomplete session warning
            if (hasIncompleteBatchSession()) {
                const state = loadBatchState();
                console.log(`\n[!] Incomplete batch session detected:`);
                console.log(`    Batch ${state.currentBatch}/${state.totalBatches} - Last updated: ${new Date(state.timestamp).toLocaleString()}`);
            }

            const choice = await this.question('\nSelect an option: ');

            try {
                switch (choice.trim().toLowerCase()) {
                    case '1':
                        await this.processRecentMessages();
                        await this.question('\nPress Enter to continue...');
                        break;
                    case '2':
                        await this.viewOpenDMs();
                        await this.question('\nPress Enter to continue...');
                        break;
                    case '3':
                        await this.closeAllDMs();
                        await this.question('\nPress Enter to continue...');
                        break;
                    case '4':
                        await this.reopenSpecificDM();
                        await this.question('\nPress Enter to continue...');
                        break;
                    case '5':
                        await this.runBatchProcessing();
                        await this.question('\nPress Enter to continue...');
                        break;
                    case '6':
                        await this.exportOpenDMs();
                        await this.question('\nPress Enter to continue...');
                        break;
                    case '7':
                        await this.resumeBatchSession();
                        await this.question('\nPress Enter to continue...');
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
        const dms = await getCurrentOpenDMs(process.env.AUTHORIZATION_TOKEN, console.log);
        
        for (const dm of dms) {
            if (dm.type === 1) {
                console.log(`Closing DM channel: ${dm.id}`);
                await closeDM(process.env.AUTHORIZATION_TOKEN, dm.id, console.log);
                await new Promise(resolve => setTimeout(resolve, this.options.API_DELAY_MS));
            }
        }
        console.log('All DMs closed successfully!');
    }

    async reopenSpecificDM() {
        await this.ensureConfigured();
        
        const userId = await this.question('\nEnter Discord User ID: ');
        
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

    async runBatchProcessing() {
        await this.ensureConfigured();
        
        console.log('\nStarting batch DM processing...');
        console.log('This will close all open DMs, then reopen them in batches for review.');
        
        // Check if there's an incomplete session
        if (hasIncompleteBatchSession()) {
            const state = loadBatchState();
            console.log(`\n[!] Warning: Incomplete batch session detected (Batch ${state.currentBatch}/${state.totalBatches})`);
            const resume = await this.question('Resume from last session? (y/n): ');
            
            if (resume.toLowerCase() === 'y') {
                await this.resumeBatchSession();
                return;
            } else {
                console.log('Starting new batch session...');
                clearBatchState();
            }
        }
        
        // Ask if user wants to skip to a specific batch
        const skipBatch = await this.question('\nStart from batch number (press Enter for 1): ');
        const startBatch = skipBatch.trim() ? parseInt(skipBatch) - 1 : 0;
        
        if (startBatch > 0) {
            console.log(`Starting from batch ${startBatch + 1}...`);
        }
        
        try {
            await processDMsInBatches(startBatch);
        } catch (error) {
            console.error('Batch processing failed:', error.message);
        }
    }

    async resumeBatchSession() {
        await this.ensureConfigured();
        
        if (!hasIncompleteBatchSession()) {
            console.log('\nNo incomplete batch session found.');
            return;
        }
        
        const state = loadBatchState();
        console.log('\nResuming batch session...');
        console.log(`Last session: Batch ${state.currentBatch}/${state.totalBatches}`);
        console.log(`Processed: ${state.processedUsers} users`);
        console.log(`Skipped: ${state.skippedUsers} users`);
        console.log(`Last updated: ${new Date(state.timestamp).toLocaleString()}`);
        
        const confirm = await this.question(`\nResume from batch ${state.currentBatch + 1}? (y/n): `);
        
        if (confirm.toLowerCase() !== 'y') {
            console.log('Resume cancelled.');
            return;
        }
        
        try {
            await processDMsInBatches(state.currentBatch);
        } catch (error) {
            console.error('Batch processing failed:', error.message);
        }
    }

    async exportOpenDMs() {
        await this.ensureConfigured();
        
        // Validate DCE_PATH exists
        const dcePath = this.options.DCE_PATH;
        if (!dcePath) {
            console.error('\nError: DCE_PATH not configured.');
            console.error('Please configure Discord Chat Exporter path in Configuration menu.');
            return;
        }

        const dceExecutable = path.join(dcePath, 'DiscordChatExporter.Cli');
        if (!fs.existsSync(dceExecutable) && !fs.existsSync(dceExecutable + '.exe')) {
            console.error(`\nError: Discord Chat Exporter not found at: ${dceExecutable}`);
            console.error('Please verify DCE_PATH in Configuration menu.');
            return;
        }

        // Validate EXPORT_PATH exists
        if (!this.options.EXPORT_PATH) {
            console.error('\nError: EXPORT_PATH not configured.');
            console.error('Please configure export path in Configuration menu.');
            return;
        }

        console.log('\nExporting open DMs...');
        console.log('This will export all currently open DMs using Discord Chat Exporter.');
        
        const formats = ['Json', 'HtmlDark'];
        
        for (const format of formats) {
            console.log(`\nExporting in ${format} format...`);
            
            try {
                await this.runDCEExport(format);
                console.log(`${format} export completed.`);
            } catch (error) {
                console.error(`${format} export failed: ${error.message}`);
            }
        }
        
        console.log('\nAll exports completed!');
    }

    async runDCEExport(format) {
        return new Promise((resolve, reject) => {
            const dcePath = this.options.DCE_PATH;
            const exportPath = this.options.EXPORT_PATH;
            const authToken = process.env.AUTHORIZATION_TOKEN;
            
            const dceExecutable = path.join(dcePath, 'DiscordChatExporter.Cli');
            
            const args = [
                'exportdm',
                '-t', authToken,
                '-o', `${exportPath}/%G/%c/%C - %d/`,
                '--partition', '10MB',
                '--format', format,
                '--media-dir', `${exportPath}/media`,
                '--media',
                '--reuse-media',
                '--parallel', '4'
            ];

            const dceProcess = spawn(dceExecutable, args);
            
            dceProcess.stdout.on('data', (data) => {
                console.log(data.toString().trim());
            });
            
            dceProcess.stderr.on('data', (data) => {
                console.error(data.toString().trim());
            });
            
            dceProcess.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`DCE exited with code ${code}`));
                }
            });
            
            dceProcess.on('error', (error) => {
                reject(new Error(`Failed to start DCE: ${error.message}`));
            });
        });
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
                        await this.question('\nPress Enter to continue...');
                }
            } catch (error) {
                console.error('Error:', error.message);
                await this.question('\nPress Enter to continue...');
            }
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
                console.log('No configuration found. Please configure via menu option 1.');
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

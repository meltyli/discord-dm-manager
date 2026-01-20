const path = require('path');
const { getCurrentOpenDMs, reopenDM } = require('../discord-api');
const { processAndExportAllDMs, closeAllOpenDMs } = require('../batch/batch-processor');
const { readJsonFile } = require('../lib/file-utils');
const { validateRequired, validateDCEPath, validatePathExists } = require('../lib/validators');
const { promptUser, waitForKeyPress, cleanInput, promptConfirmation, exportDMs, createDMProgressBar } = require('../lib/cli-helpers');
const { displaySettings, getDryRunTitle } = require('./menu-helpers');
const { isDryRun } = require('../lib/dry-run-helper');
const { getApiDelayTracker } = require('../lib/api-delay-tracker');
const { MenuBase } = require('./menu-base');
const { red, green, yellow, reset } = require('../lib/colors');
const { getIdHistoryPath } = require('../lib/path-utils');

const delayTracker = getApiDelayTracker();

class ApiMenu extends MenuBase {
    constructor(rl, configManager, ensureConfiguredFn) {
        super(rl, configManager);
        this.ensureConfigured = ensureConfiguredFn;
    }

    async show() {
        await this.runMenuLoop('Discord API Menu', () => {
            const dryTitle = getDryRunTitle(this.options);
            console.log(`\nDiscord API${dryTitle ? ' ' + dryTitle : ''}`);
            console.log('===========');
            console.log('1. List Current Open Direct Messages');
            console.log('2. Export All Direct Messages');
            console.log('3. Close All Open Direct Messages');
            console.log('4. Reopen Direct Message (Specific User ID)');
            console.log('5. Reset DM State (Reopen Closed Direct Messages)');
            console.log('q. Back to Main Menu');
        }, async (choice) => {
            switch (choice) {
                case '1':
                    return await this.executeMenuAction('List Current Open Direct Messages', 
                        () => this.viewOpenDMs());
                case '2':
                    return await this.executeMenuAction('Export All Direct Messages', 
                        () => this.processAndExportAllDMs(), true, { suppressErrorOutput: this.options.SUPPRESS_MENU_ERRORS });
                case '3':
                    return await this.executeMenuAction('Close All Open Direct Messages', 
                        () => this.closeAllDMs());
                case '4':
                    return await this.executeMenuAction('Reopen Direct Message (Specific User ID)', 
                        () => this.reopenSpecificDM());
                case '5':
                    return await this.executeMenuAction('Reset DM State (Reopen Closed Direct Messages)', 
                        () => this.resetDMState());
                case 'q':
                    return false;
                default:
                    console.log('\nInvalid option. Please try again.');
                    await waitForKeyPress(this.rl);
                    return true;
            }
        });
    }

    async resetDMState() {
        await this.ensureConfigured();
        
        const dataPackagePath = this.configManager.get('DATA_PACKAGE_FOLDER');
        const idHistoryPath = getIdHistoryPath(dataPackagePath);
        
        if (!validatePathExists(idHistoryPath, 'id-history.json')) {
            console.log('No id-history.json file found. Nothing to reopen.');
            return;
        }
        
        console.log(`Reading from ${idHistoryPath}`);
        const idHistoryData = readJsonFile(idHistoryPath);
        if (!idHistoryData) {
            console.log('Could not read id-history.json. Nothing to reopen.');
            return;
        }
        
        // Extract user IDs from latest channels
        let closedIds = [];
        if (idHistoryData.latest && Array.isArray(idHistoryData.latest)) {
            idHistoryData.latest.forEach(channel => {
                if (channel.recipients && Array.isArray(channel.recipients)) {
                    channel.recipients.forEach(recipient => {
                        if (recipient.id && !closedIds.includes(recipient.id)) {
                            closedIds.push(recipient.id);
                        }
                    });
                }
            });
        }
        
        if (closedIds.length === 0) {
            console.log('No closed direct messages to reopen.');
            return;
        }
        
        console.log(`Reopening ${closedIds.length} closed direct messages...`);

        if (isDryRun()) {
            console.log('[DRY RUN] Would reopen these user IDs:');
            console.log(closedIds);
            return;
        }

        if (!await promptConfirmation(`Reopen ${closedIds.length} closed direct messages? (y/n): `, this.rl)) {
            console.log('Operation cancelled.');
            return;
        }
        
        delayTracker.reset(closedIds.length);
        
        const reopenProgress = createDMProgressBar();
        reopenProgress.start(closedIds.length, 0);
        
        let skipped = 0;
        let reopened = 0;
        
        for (const [index, userId] of closedIds.entries()) {
            try {
                const result = await reopenDM(process.env.AUTHORIZATION_TOKEN, userId);
                if (result === null) {
                    skipped++;
                } else {
                    reopened++;
                }
                
                await delayTracker.trackAndDelay();
                reopenProgress.update(index + 1);
            } catch (error) {
                reopenProgress.stop();
                console.log('');
                throw error;
            }
        }
        reopenProgress.stop();
        
        console.log(`\nReopened: ${yellow}${reopened}${reset}, Skipped: ${yellow}${skipped}${reset}`);
    }

    async viewOpenDMs() {
        await this.ensureConfigured();

        console.log(`${yellow}Fetching open direct messages...${reset}`);
        const dms = await getCurrentOpenDMs(process.env.AUTHORIZATION_TOKEN);
        await delayTracker.trackAndDelay();
        
        console.log(`\nCount: ${yellow}${dms.length}${reset}`);
        dms.forEach(dm => {
            const channelType = dm.type === 1 ? 'DM' : dm.type === 3 ? 'GROUP_DM' : `TYPE_${dm.type}`;
            if (dm.recipients && dm.recipients.length > 0) {
                if (dm.type === 3) {
                    const usernames = dm.recipients.map(r => r.username).join(', ');
                    console.log(`- Channel ID: ${yellow}${dm.id}${reset}, Type: ${channelType}, Users: ${yellow}${usernames}${reset}`);
                } else {
                    console.log(`- Channel ID: ${yellow}${dm.id}${reset}, Type: ${channelType}, User: ${yellow}${dm.recipients[0].username}${reset}`);
                }
            } else {
                console.log(`- Channel ID: ${yellow}${dm.id}${reset}, Type: ${channelType}`);
            }
        });
    }

    async closeAllDMs() {
        await this.ensureConfigured();
        
        if (isDryRun()) {
            console.log('[DRY RUN] Fetching open direct messages...');
        } else {
            if (!await promptConfirmation('Close all open direct messages? (y/n): ', this.rl)) {
                console.log('Operation cancelled.');
                return;
            }
        }

        await closeAllOpenDMs();

        if (!isDryRun()) {
            console.log(`\n${green}All direct messages closed successfully!${reset}`);
        }
    }

    async reopenSpecificDM() {
        await this.ensureConfigured();
        
        const userId = cleanInput(await promptUser('Enter Discord User ID (or q to cancel): ', this.rl));

        if (userId === 'q') {
            console.log('Cancelled.');
            return;
        }

        if (isDryRun()) {
            console.log(`\n[DRY RUN] Would reopen direct message with user ${userId}`);
            return;
        }

        if (!await promptConfirmation(`Reopen direct message with user ${userId}? (y/n): `, this.rl)) {
            console.log('Operation cancelled.');
            return;
        }

        const result = await reopenDM(process.env.AUTHORIZATION_TOKEN, userId);
        if (result) {
            console.log(`\n${green}Direct message reopened successfully!${reset}`);
        } else {
            console.log(`\n${yellow}Could not reopen direct message${reset} (user may not exist or be inaccessible).`);
        }
    }

    async processAndExportAllDMs() {
        await this.ensureConfigured();
        
        // Validate DCE_PATH and EXPORT_PATH
        try {
            validateDCEPath(this.options.DCE_PATH);
            validateRequired(this.options.EXPORT_PATH, 'EXPORT_PATH', 'export path');
        } catch (error) {
            console.error(`Error: ${error.message}`);
            return;
        }

        // Hardcoded to DM only (1-on-1 conversations)
        const typeFilter = ['DM'];

        console.clear();
        console.log(`\n${yellow}Process and Export All Direct Messages${reset}`);
        console.log('=======================================');;
        console.log('This will:');
        console.log('1. Close all currently open direct messages');
        console.log(`2. Open direct messages in batches of ${yellow}${this.options.BATCH_SIZE}${reset}`);
        console.log('3. Export each batch using Discord Chat Exporter');
        console.log('4. Close the batch and move to the next');
        console.log('5. Repeat until all direct messages are processed');
        console.log('6. Reset DM state by reopening closed direct messages\n');
        
        if (!await promptConfirmation('Continue? (y/n): ', this.rl)) {
            console.log('Operation cancelled.');
            return;
        }

        // Create export callback using centralized helper
        const exportCallback = async () => {
            const { getCurrentOpenDMs } = require('../discord-api');
            const path = require('path');
            const openDMs = await getCurrentOpenDMs(process.env.AUTHORIZATION_TOKEN);
            const dmChannels = openDMs.filter(dm => dm.type === 1);
            
            const dataPackagePath = this.options.DATA_PACKAGE_FOLDER;
            const idHistoryPath = getIdHistoryPath(dataPackagePath);
            
            return await exportDMs(
                process.env.AUTHORIZATION_TOKEN,
                this.options.EXPORT_PATH,
                this.options.DCE_PATH,
                process.env.USER_DISCORD_ID,
                ['Json'],
                dmChannels,
                2,
                idHistoryPath
            );
        };

        try {
            await processAndExportAllDMs(exportCallback, this.rl, typeFilter);
            console.log(`\n${green}All direct messages processed and exported successfully!${reset}`);
            console.log('\nResetting DM state...');
            await this.resetDMState();
        } catch (error) {
            console.error('Process and export failed:', error.message);
        }
    }
}

module.exports = { ApiMenu };

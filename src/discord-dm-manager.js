require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const axios = require('axios');
const cliProgress = require('cli-progress');
const { configManager } = require('./config');

// Set up logging
const logDir = './logs';
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}
const logFile = path.join(logDir, `${new Date().toISOString().split('T')[0]}.log`);
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

const LogLevels = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3
};

function logOutput(message, level = 'info') {
    if (LogLevels[level] <= LogLevels[configManager.get('LOG_LEVEL')]) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
        console.log(logMessage);
        logStream.write(logMessage + '\n');
    }
}

// Rate limiting implementation
class RateLimiter {
    constructor(maxRequests, interval) {
        this.maxRequests = maxRequests;
        this.interval = interval;
        this.requests = [];
    }

    async waitForSlot() {
        const now = Date.now();
        this.requests = this.requests.filter(time => time > now - this.interval);
        
        if (this.requests.length >= this.maxRequests) {
            const oldestRequest = this.requests[0];
            const waitTime = oldestRequest + this.interval - now;
            await delay(waitTime);
            return this.waitForSlot();
        }
        
        this.requests.push(now);
    }
}

// Discord API functions with rate limiting
const rateLimiter = new RateLimiter(configManager.get('RATE_LIMIT_REQUESTS'), configManager.get('RATE_LIMIT_INTERVAL_MS'));

async function getCurrentOpenDMs(authToken) {
    await rateLimiter.waitForSlot();
    return withRetry(async () => {
        const response = await axios.get('https://discord.com/api/v9/users/@me/channels', {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authToken
            }
        });
        return response.data;
    }, 'Fetching current open DMs');
}

// valid user == (!deleted and anything with 400/404 response) and keep logs for skips/failures
async function validateUser(authToken, userId) {
    await rateLimiter.waitForSlot();
    try {
        const response = await axios.get(`https://discord.com/api/v9/users/@me/channels`, {
            headers: {
                'Authorization': authToken,
                'Content-Type': 'application/json'
            }
        });
        
        return true;
    } catch (error) {
        if (error.response && error.response.status === 404) {
            logOutput(`User ${userId} not found, skipping`, 'info');
            return false;
        }
        if (error.response && error.response.status === 400) {
            logOutput(`Invalid user ID ${userId}, skipping`, 'info');
            return false;
        }
        if (error.response && error.response.status === 403) {
            logOutput(`403 Status on user ID ${userId}, skipping. Likely a deleted user.`, 'info');
            return false;
        }
        throw error;
    }
}

async function reopenDM(authToken, userId) {
    await rateLimiter.waitForSlot();
    
    if (configManager.get('DRY_RUN')) {
        logOutput(`[DRY RUN] Would reopen DM with user ${userId}`, 'info');
        return { id: 'dry-run-id' };
    }

    // Validate user before attempting to reopen DM
    const isValid = await validateUser(authToken, userId);
    if (!isValid) {
        return null;
    }
    
    return withRetry(async () => {
        const response = await axios.post('https://discord.com/api/v9/users/@me/channels', 
            { recipients: [userId] }, 
            {
                headers: {
                    'Authorization': authToken,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data;
    }, `Reopening DM with user ${userId}`);
}

async function closeDM(authToken, channelId) {
    await rateLimiter.waitForSlot();
    if (configManager.get('DRY_RUN')) {
        logOutput(`[DRY RUN] Would close DM channel ${channelId}`, 'info');
        return;
    }
    
    return withRetry(async () => {
        const response = await axios.delete(`https://discord.com/api/v9/channels/${channelId}`, {
            headers: {
                'Authorization': authToken,
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    }, `Closing DM channel ${channelId}`);
}

// Data processing functions
function traverseDataPackage(packagePath) {
    const channelJsonPaths = [];
    
    function traverse(currentPath) {
        try {
            const files = fs.readdirSync(currentPath);
            files.forEach(file => {
                const fullPath = path.join(currentPath, file);
                const fileStat = fs.statSync(fullPath);
                
                if (fileStat.isFile() && fullPath.includes('channel.json')) {
                    channelJsonPaths.push(fullPath);
                } else if (fileStat.isDirectory()) {
                    traverse(fullPath);
                }
            });
        } catch (error) {
            logOutput(`Error accessing directory ${currentPath}: ${error.message}`, 'error');
            throw error;
        }
    }

    traverse(packagePath);
    return channelJsonPaths;
}

function getRecipients(channelJsonPaths, myDiscordId) {
    const recipientIds = new Set();
    
    channelJsonPaths.forEach(filePath => {
        try {
            const data = fs.readFileSync(filePath, 'utf8');
            const channelJson = JSON.parse(data.trim());
            
            if (channelJson.type === "DM") {
                channelJson.recipients.forEach(recipientId => {
                    if (recipientId !== myDiscordId) {
                        recipientIds.add(recipientId);
                    }
                });
            }
        } catch (error) {
            logOutput(`Error processing file ${filePath}: ${error.message}`, 'error');
        }
    });

    return Array.from(recipientIds);
}

// Utility functions
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForKeyPress() {
    logOutput('Press any key to continue...', 'info');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    return new Promise(resolve => {
        rl.question('', () => {
            rl.close();
            resolve();
        });
    });
}

// Progress tracking
function createProgressBar() {
    return new cliProgress.SingleBar({
        format: 'Progress |{bar}| {percentage}% || {value}/{total} DMs',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591'
    });
}

// Main processing function
async function processDMsInBatches() {
    logOutput('Starting DM processing...', 'info');

    try {
        await configManager.init();

        const channelJsonPaths = traverseDataPackage(configManager.get('DATA_PACKAGE_FOLDER'));
        const allDmIds = getRecipients(channelJsonPaths, configManager.getEnv('USER_DISCORD_ID'));

        if (allDmIds.length === 0) {
            logOutput('No DM recipients found. Please check your Discord ID and data package path.', 'warn');
            return;
        }

        if (configManager.get('DRY_RUN')) {
            logOutput('Running in DRY RUN mode - no actual API calls will be made', 'info');
        }

        const currentDMs = await getCurrentOpenDMs(configManager.getEnv('AUTHORIZATION_TOKEN'));
        logOutput(`Closing ${currentDMs.length} currently open DMs...`, 'info');
        
        const closeProgress = createProgressBar();
        closeProgress.start(currentDMs.length, 0);
        
        for (const [index, dm] of currentDMs.entries()) {
            if (dm.type === 1) {
                logOutput(`Closing DM channel: ${dm.id}`, 'debug');
                await closeDM(configManager.getEnv('AUTHORIZATION_TOKEN'), dm.id);
                await delay(configManager.get('API_DELAY_MS'));
            }
            closeProgress.update(index + 1);
        }
        closeProgress.stop();

        const totalBatches = Math.ceil(allDmIds.length / configManager.get('BATCH_SIZE'));
        logOutput(`Processing ${allDmIds.length} DMs in ${totalBatches} batches of ${configManager.get('BATCH_SIZE')}`, 'info');
        
        const batchProgress = createProgressBar();
        let skippedUsers = 0;
        let processedUsers = 0;
        
        for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
            const startIdx = batchNum * configManager.get('BATCH_SIZE');
            const endIdx = Math.min((batchNum + 1) * configManager.get('BATCH_SIZE'), allDmIds.length);
            const currentBatch = allDmIds.slice(startIdx, endIdx);

            logOutput(`Processing batch ${batchNum + 1}/${totalBatches}`, 'info');
            batchProgress.start(currentBatch.length, 0);

            for (const [index, userId] of currentBatch.entries()) {
                const result = await reopenDM(configManager.getEnv('AUTHORIZATION_TOKEN'), userId);
                if (result === null) {
                    skippedUsers++;
                } else {
                    processedUsers++;
                }
                await delay(configManager.get('API_DELAY_MS'));
                batchProgress.update(index + 1);
            }
            batchProgress.stop();

            if (!configManager.get('DRY_RUN')) {
                logOutput('Batch complete. Please review these DMs.', 'info');
                await waitForKeyPress();

                const batchDMs = await getCurrentOpenDMs(configManager.getEnv('AUTHORIZATION_TOKEN'));
                for (const dm of batchDMs) {
                    if (dm.type === 1) {
                        await closeDM(configManager.getEnv('AUTHORIZATION_TOKEN'), dm.id);
                        await delay(configManager.get('API_DELAY_MS'));
                    }
                }
            }
        }

        logOutput(`Processing complete!`, 'info');
        logOutput(`Processed users: ${processedUsers}`, 'info');
        logOutput(`Skipped users: ${skippedUsers}`, 'info');
    } catch (error) {
        logOutput(`Fatal error in main process: ${error.message}`, 'error');
        throw error;
    }
}

// Start processing
processDMsInBatches().catch(error => {
    logOutput(`Error in main process: ${error.stack}`, 'error');
    process.exit(1);
});

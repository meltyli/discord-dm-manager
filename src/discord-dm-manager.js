require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const axios = require('axios');
const cliProgress = require('cli-progress');

// Default configurations
const defaultConfig = {
    BATCH_SIZE: 100,
    API_DELAY_MS: 1000,
    MAX_RETRIES: 3,
    RETRY_DELAY_MS: 5000,
    RATE_LIMIT_REQUESTS: 50,
    RATE_LIMIT_INTERVAL_MS: 60000,
    LOG_LEVEL: 'info',
    DATA_PACKAGE_FOLDER: '',
    EXPORT_PATH: '',
    DCE_PATH: '',
    DRY_RUN: false,
    SKIP_DELETED_USERS: true,
    DELETED_USER_PATTERN: /^Deleted User/i  // Case insensitive match for "Deleted User"
};

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
    if (LogLevels[level] <= LogLevels[config.LOG_LEVEL]) {
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

// Environment and config setup
const envTemplate = {
    AUTHORIZATION_TOKEN: '',
    USER_DISCORD_ID: ''
};

let config = { ...defaultConfig };

async function ensureConfigs() {
    // Check for .env first
    await ensureEnvValues();

    // Then handle config.json
    try {
        if (fs.existsSync('config.json')) {
            const fileConfig = JSON.parse(fs.readFileSync('config.json', 'utf8'));
            config = { ...defaultConfig, ...fileConfig };
        } else {
            logOutput('No config.json found, creating with default values...', 'warn');
            await createConfigFile();
        }
    } catch (error) {
        logOutput(`Error handling config.json: ${error.message}`, 'error');
        throw error;
    }

    // Validate required paths exist
    await validatePaths();
}

async function createConfigFile() {
    for (const [key, value] of Object.entries(defaultConfig)) {
        if (value === '' && !process.env[key]) {
            config[key] = await promptUser(`Enter value for ${key}: `);
        }
    }
    fs.writeFileSync('config.json', JSON.stringify(config, null, 2));
}

async function validatePaths() {
    const pathsToCheck = ['DATA_PACKAGE_FOLDER', 'EXPORT_PATH', 'DCE_PATH'];
    
    for (const pathKey of pathsToCheck) {
        const pathValue = config[pathKey];
        if (!fs.existsSync(pathValue)) {
            logOutput(`Path ${pathKey} (${pathValue}) does not exist`, 'warn');
            const newPath = await promptUser(`Enter valid path for ${pathKey}: `);
            config[pathKey] = newPath;
            updateConfigFile();
        }
    }
}

function updateConfigFile() {
    fs.writeFileSync('config.json', JSON.stringify(config, null, 2));
}

// Retry mechanism
async function withRetry(operation, description) {
    for (let attempt = 1; attempt <= config.MAX_RETRIES; attempt++) {
        try {
            return await operation();
        } catch (error) {
            if (attempt === config.MAX_RETRIES) {
                throw error;
            }
            logOutput(`${description} failed, attempt ${attempt}/${config.MAX_RETRIES}: ${error.message}`, 'warn');
            await delay(config.RETRY_DELAY_MS);
        }
    }
}

// Environment setup functions
async function ensureEnvValues() {
    for (const [key, defaultValue] of Object.entries(envTemplate)) {
        if (!process.env[key]) {
            const value = await promptUser(`Enter value for ${key}: `);
            envTemplate[key] = value.trim();
        } else {
            envTemplate[key] = process.env[key].trim();
        }
    }
    updateEnvFile();
}

function promptUser(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => rl.question(query, answer => {
        rl.close();
        resolve(answer);
    }));
}

function updateEnvFile() {
    const envLines = Object.entries(envTemplate)
        .filter(([key, value]) => value !== undefined)
        .map(([key, value]) => `${key}=${value}`);

    if (!fs.existsSync('.env')) {
        fs.writeFileSync('.env', envLines.join('\n'));
    } else {
        const existingEnv = fs.readFileSync('.env', 'utf-8')
            .split('\n')
            .reduce((acc, line) => {
                if (line.trim()) {
                    const [key, value] = line.split('=');
                    acc[key] = value;
                }
                return acc;
            }, {});

        for (const [key, value] of Object.entries(envTemplate)) {
            if (value !== undefined) {
                existingEnv[key] = value;
            }
        }

        const updatedEnvLines = Object.entries(existingEnv)
            .map(([key, value]) => `${key}=${value}`);
        fs.writeFileSync('.env', updatedEnvLines.join('\n'));
    }
}

// Discord API functions with rate limiting
const rateLimiter = new RateLimiter(config.RATE_LIMIT_REQUESTS, config.RATE_LIMIT_INTERVAL_MS);

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
        const response = await axios.get(`https://discord.com/api/v9/users/${userId}`, {
            headers: {
                'Authorization': authToken,
                'Content-Type': 'application/json'
            }
        });
        
        if (config.SKIP_DELETED_USERS && config.DELETED_USER_PATTERN.test(response.data.username)) {
            logOutput(`Skipping deleted user: ${userId}`, 'info');
            return false;
        }
        
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
        throw error;
    }
}

async function reopenDM(authToken, userId) {
    await rateLimiter.waitForSlot();
    
    if (config.DRY_RUN) {
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
    if (config.DRY_RUN) {
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
        await ensureConfigs();

        const channelJsonPaths = traverseDataPackage(config.DATA_PACKAGE_FOLDER);
        const allDmIds = getRecipients(channelJsonPaths, envTemplate.USER_DISCORD_ID);

        if (allDmIds.length === 0) {
            logOutput('No DM recipients found. Please check your Discord ID and data package path.', 'warn');
            return;
        }

        if (config.DRY_RUN) {
            logOutput('Running in DRY RUN mode - no actual API calls will be made', 'info');
        }

        const currentDMs = await getCurrentOpenDMs(envTemplate.AUTHORIZATION_TOKEN);
        logOutput(`Closing ${currentDMs.length} currently open DMs...`, 'info');
        
        const closeProgress = createProgressBar();
        closeProgress.start(currentDMs.length, 0);
        
        for (const [index, dm] of currentDMs.entries()) {
            if (dm.type === 1) {
                logOutput(`Closing DM channel: ${dm.id}`, 'debug');
                await closeDM(envTemplate.AUTHORIZATION_TOKEN, dm.id);
                await delay(config.API_DELAY_MS);
            }
            closeProgress.update(index + 1);
        }
        closeProgress.stop();

        const totalBatches = Math.ceil(allDmIds.length / config.BATCH_SIZE);
        logOutput(`Processing ${allDmIds.length} DMs in ${totalBatches} batches of ${config.BATCH_SIZE}`, 'info');
        
        const batchProgress = createProgressBar();
        let skippedUsers = 0;
        let processedUsers = 0;
        
        for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
            const startIdx = batchNum * config.BATCH_SIZE;
            const endIdx = Math.min((batchNum + 1) * config.BATCH_SIZE, allDmIds.length);
            const currentBatch = allDmIds.slice(startIdx, endIdx);

            logOutput(`Processing batch ${batchNum + 1}/${totalBatches}`, 'info');
            batchProgress.start(currentBatch.length, 0);

            for (const [index, userId] of currentBatch.entries()) {
                const result = await reopenDM(envTemplate.AUTHORIZATION_TOKEN, userId);
                if (result === null) {
                    skippedUsers++;
                } else {
                    processedUsers++;
                }
                await delay(config.API_DELAY_MS);
                batchProgress.update(index + 1);
            }
            batchProgress.stop();

            if (!config.DRY_RUN) {
                logOutput('Batch complete. Please review these DMs.', 'info');
                await waitForKeyPress();

                const batchDMs = await getCurrentOpenDMs(envTemplate.AUTHORIZATION_TOKEN);
                for (const dm of batchDMs) {
                    if (dm.type === 1) {
                        await closeDM(envTemplate.AUTHORIZATION_TOKEN, dm.id);
                        await delay(config.API_DELAY_MS);
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

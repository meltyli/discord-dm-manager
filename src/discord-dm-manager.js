require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const axios = require('axios');

// Set up logging
const logDir = './logs';
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}
const logFile = path.join(logDir, `${new Date().toISOString().split('T')[0]}.log`);
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

function logOutput(message) {
    console.log(message);
    logStream.write(`${new Date().toISOString()} - ${message}\n`);
}

// Environment configuration
const envTemplate = {
    AUTHORIZATION_TOKEN: '',
    USER_DISCORD_ID: '',
    DATA_PACKAGE_FOLDER: '',
    EXPORT_PATH: '',
    DCE_PATH: '',
    LAST_SUCCESSFUL_DATE: ''
};

// Environment setup functions
async function ensureEnvValues() {
    for (const [key, defaultValue] of Object.entries(envTemplate)) {
        if (!process.env[key]) {
            const value = await promptUser(`Enter value for ${key}: `);
            envTemplate[key] = value;
        } else {
            envTemplate[key] = process.env[key];
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

function updateLastSuccessfulDate() {
    envTemplate.LAST_SUCCESSFUL_DATE = new Date().toISOString();
    updateEnvFile();
}

// Discord API functions
async function getCurrentOpenDMs(authToken) {
    try {
        const response = await axios.get('https://discord.com/api/v9/users/@me/channels', {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authToken
            }
        });
        return response.data;
    } catch (error) {
        logOutput(`Error fetching current open DMs: ${error.message}`);
        throw error;
    }
}

async function reopenDM(authToken, userId) {
    try {
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
    } catch (error) {
        logOutput(`Error reopening DM with user ${userId}: ${error.message}`);
        throw error;
    }
}

async function closeDM(authToken, channelId) {
    try {
        const response = await axios.delete(`https://discord.com/api/v9/channels/${channelId}`, {
            headers: {
                'Authorization': authToken,
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (error) {
        logOutput(`Error closing DM channel ${channelId}: ${error.message}`);
        throw error;
    }
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
            logOutput(`Error accessing directory ${currentPath}: ${error.message}`);
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
            logOutput(`Error processing file ${filePath}: ${error.message}`);
        }
    });

    return Array.from(recipientIds);
}

// Utility functions
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForKeyPress() {
    logOutput('Press any key to continue...');
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

// Main processing function
async function processDMsInBatches() {
    logOutput('Starting DM processing...');

    try {
        await ensureEnvValues();

        const channelJsonPaths = traverseDataPackage(envTemplate.DATA_PACKAGE_FOLDER);
        const allDmIds = getRecipients(channelJsonPaths, envTemplate.USER_DISCORD_ID);

        if (allDmIds.length === 0) {
            logOutput('No DM recipients found. Please check your Discord ID and data package path.');
            return;
        }

        const currentDMs = await getCurrentOpenDMs(envTemplate.AUTHORIZATION_TOKEN);
        logOutput(`Closing ${currentDMs.length} currently open DMs...`);
        
        for (const dm of currentDMs) {
            if (dm.type === 1) {
                logOutput(`Closing DM channel: ${dm.id}`);
                await closeDM(envTemplate.AUTHORIZATION_TOKEN, dm.id);
                await delay(1000);
            }
        }

        const BATCH_SIZE = 100;
        const totalBatches = Math.ceil(allDmIds.length / BATCH_SIZE);

        logOutput(`Processing ${allDmIds.length} DMs in ${totalBatches} batches of ${BATCH_SIZE}`);
        
        for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
            const startIdx = batchNum * BATCH_SIZE;
            const endIdx = Math.min((batchNum + 1) * BATCH_SIZE, allDmIds.length);
            const currentBatch = allDmIds.slice(startIdx, endIdx);

            logOutput(`Processing batch ${batchNum + 1}/${totalBatches}`);
            logOutput(`Opening DMs ${startIdx + 1} to ${endIdx}`);

            for (const userId of currentBatch) {
                logOutput(`Opening DM with user: ${userId}`);
                await reopenDM(envTemplate.AUTHORIZATION_TOKEN, userId);
                await delay(1000);
            }

            logOutput('Batch complete. Please review these DMs.');
            await waitForKeyPress();

            const batchDMs = await getCurrentOpenDMs(envTemplate.AUTHORIZATION_TOKEN);
            for (const dm of batchDMs) {
                if (dm.type === 1) {
                    await closeDM(envTemplate.AUTHORIZATION_TOKEN, dm.id);
                    await delay(1000);
                }
            }
        }

        logOutput('All batches processed successfully!');
        updateLastSuccessfulDate();
    } catch (error) {
        logOutput(`Fatal error in main process: ${error.message}`);
        throw error;
    }
}

// Start processing
processDMsInBatches().catch(error => {
    logOutput(`Error in main process: ${error.stack}`);
    process.exit(1);
});

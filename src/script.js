require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const authorizationToken = process.env.AUTHORIZATION_TOKEN;
const dataPackageMessageFolder = process.env.DATA_PACKAGE_FOLDER;
const myDiscordId = process.env.MY_DISCORD_ID;
const BATCH_SIZE = 100;

let channelJsonPaths = [];

// Traverse through the data package to find all channel.json files
function traverseDataPackage(packagePath) {
    try {
        const files = fs.readdirSync(packagePath);
        files.forEach(file => {
            const currentPath = path.join(packagePath, file);
            const fileStat = fs.statSync(currentPath);
            if (fileStat.isFile() && currentPath.includes('channel.json')) {
                channelJsonPaths.push(currentPath);
            } else if (fileStat.isDirectory()) {
                traverseDataPackage(currentPath);
            }
        });
    } catch (error) {
        console.error('Error accessing directory:', error);
        throw error;
    }
}

// Get all recipient IDs from the channel.json files
function getRecipients(channelJsonPaths, myDiscordID) {
    let recipientIds = [];
    channelJsonPaths.forEach(filePath => {
        try {
            const data = fs.readFileSync(filePath, 'utf8');
            const channelJson = JSON.parse(data.trim());
            if (channelJson.type === "DM") {
                channelJson.recipients.forEach(value => {
                    if (value !== myDiscordID) {
                        recipientIds.push(value);
                    }
                });
            }
        } catch (error) {
            console.error(`Error processing file ${filePath}:`, error);
        }
    });
    return recipientIds;
}

// Get currently open DMs
async function getCurrentOpenDMs() {
    try {
        const response = await axios.get('https://discord.com/api/v9/users/@me/channels', {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authorizationToken
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching current open DMs:', error);
    }
}

// Reopen a DM with a user
async function reopenDM(userId) {
    try {
        const response = await axios.post('https://discord.com/api/v9/users/@me/channels', 
        { recipients: [userId] }, 
        {
            headers: {
                'Authorization': authorizationToken,
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error reopening DM:', error);
    }
}

// Close a DM channel
async function closeDM(channelId) {
    try {
        const response = await axios.delete(`https://discord.com/api/v9/channels/${channelId}`, {
            headers: {
                'Authorization': authorizationToken,
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error closing DM:', error);
    }
}

async function processDMsInBatches() {
    console.log('Starting DM processing...');

    traverseDataPackage(dataPackageMessageFolder);
    const allDmIds = getRecipients(channelJsonPaths, myDiscordId);

    if (allDmIds.length === 0) {
        console.log('No DM recipients found.');
        return;
    }

    const currentDMs = await getCurrentOpenDMs();
    console.log(`Closing ${currentDMs.length} currently open DMs...`);
    for (const dm of currentDMs) {
        if (dm.type === 1) {
            await closeDM(dm.id);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    const totalBatches = Math.ceil(allDmIds.length / BATCH_SIZE);
    console.log(`Processing ${allDmIds.length} DMs in ${totalBatches} batches of ${BATCH_SIZE}`);

    for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
        const startIdx = batchNum * BATCH_SIZE;
        const endIdx = Math.min((batchNum + 1) * BATCH_SIZE, allDmIds.length);
        const currentBatch = allDmIds.slice(startIdx, endIdx);

        console.log(`Processing batch ${batchNum + 1}/${totalBatches}`);
        for (const userId of currentBatch) {
            await reopenDM(userId);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log('Batch complete. Please review these DMs.');
        console.log('Press any key to continue to the next batch...');
        await new Promise(resolve => process.stdin.once('data', resolve));
    }

    console.log('All batches processed!');
}

processDMsInBatches().catch(error => {
    console.error('Error in main process:', error);
    process.exit(1);
});

const fs = require('fs');
const path = require('path');
const request = require('request');

// --- CONFIG ---
const authorizationtoken = 'mfa.longrandomstring'; // Replace with your token
const datapackagemessagefolder = '/path/to/your/discord/package/messages'; // Replace with your path
const myDiscordid = '000000000000000000'; // Replace with your Discord ID
const BATCH_SIZE = 100;
let channeljsonpaths = [];

// Traverse through the data package to find all channel.json files
function traverseDataPackage(packagepath) {
    let files = fs.readdirSync(packagepath);
    files.forEach(function (file, index) {
        var currpath = path.join(packagepath, file);
        let filestat = fs.statSync(currpath);
        if (filestat.isFile()) {
            if (currpath.includes("channel.json")) {
                channeljsonpaths.push(currpath);
            }
        }
        else if (filestat.isDirectory()) {
            traverseDataPackage(currpath);
        } 
    });
}

// Get all recipient IDs from the channel.json files
function getrecipients(channeljsonpaths, mydiscordID) {
    let recipientsids = [];
    for (var i = 0; i < channeljsonpaths.length; i++) {
        var data = fs.readFileSync(channeljsonpaths[i]);
        let channeljson = JSON.parse(data);
        if (channeljson.type == 1) {
            channeljson.recipients.forEach(function(value) {
                if (value != mydiscordID) {
                    recipientsids.push(value);
                }
            });
        }
    }
    return recipientsids;
}

// Get currently open DMs
function getcurrentopendms(authorizationtoken) {
    return new Promise(function (resolve, reject) {
        request({
            method: 'get',
            url: 'https://discordapp.com/api/users/@me/channels',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authorizationtoken
            }
        }, (err, resp, body) => {
            if (err) {
                reject(err);
            }
            resolve(body);
        });
    });
}

// Reopen a DM with a user
function reopendm(authorizationtoken, userid) {
    return new Promise((resolve, reject) => {
        const options = {
            method: 'POST',
            url: 'https://discordapp.com/api/users/@me/channels',
            headers: {
                'cache-control': 'no-cache',
                'Authorization': authorizationtoken,
                'Content-Type': 'application/json'
            },
            body: { recipients: [userid] },
            json: true
        };

        request(options, (error, response, body) => {
            if (error) reject(error);
            resolve(body);
        });
    });
}

// Close a DM channel
function closeDM(authorizationtoken, channelId) {
    return new Promise((resolve, reject) => {
        const options = {
            method: 'DELETE',
            url: `https://discordapp.com/api/channels/${channelId}`,
            headers: {
                'Authorization': authorizationtoken,
                'Content-Type': 'application/json'
            }
        };
        
        request(options, (error, response, body) => {
            if (error) reject(error);
            resolve(body);
        });
    });
}

// Helper function to wait for key press
function waitForKeyPress() {
    return new Promise(resolve => {
        console.log('Press any key to continue...');
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.once('data', () => {
            process.stdin.setRawMode(false);
            resolve();
        });
    });
}

// Delay function for rate limiting
function delay(time) {
    return new Promise(function (resolve) {
        setTimeout(resolve, time)
    });
}

async function processDMsInBatches() {
    // Get all historical DM recipients
    traverseDataPackage(datapackagemessagefolder);
    const allDmids = getrecipients(channeljsonpaths, myDiscordid);
    
    // Close all current DMs first
    const currentDMs = await getcurrentopendms(authorizationtoken);
    const currentDMsJson = JSON.parse(currentDMs);
    
    console.log(`Closing ${currentDMsJson.length} currently open DMs...`);
    for (const dm of currentDMsJson) {
        if (dm.type === 1) { // Ensure it's a DM
            await closeDM(authorizationtoken, dm.id);
            await delay(1000); // Respect rate limits
        }
    }
    
    // Process in batches
    const totalBatches = Math.ceil(allDmids.length / BATCH_SIZE);
    
    console.log(`Processing ${allDmids.length} DMs in ${totalBatches} batches of ${BATCH_SIZE}`);
    
    for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
        const startIdx = batchNum * BATCH_SIZE;
        const endIdx = Math.min((batchNum + 1) * BATCH_SIZE, allDmids.length);
        const currentBatch = allDmids.slice(startIdx, endIdx);
        
        console.log(`\nProcessing batch ${batchNum + 1}/${totalBatches}`);
        console.log(`Opening DMs ${startIdx + 1} to ${endIdx}`);
        
        // Open DMs in current batch
        for (const userId of currentBatch) {
            console.log(`Opening DM with user: ${userId}`);
            await reopendm(authorizationtoken, userId);
            await delay(1000);
        }
        
        // Pause for review
        console.log('\nBatch complete. Please review these DMs.');
        console.log('Press any key to close these DMs and continue to the next batch...');
        await waitForKeyPress();
        
        // Close the batch of DMs
        const currentDMs = await getcurrentopendms(authorizationtoken);
        const currentDMsJson = JSON.parse(currentDMs);
        
        for (const dm of currentDMsJson) {
            if (dm.type === 1) {
                await closeDM(authorizationtoken, dm.id);
                await delay(1000);
            }
        }
    }
    
    console.log('All batches processed!');
}

// Run the script
processDMsInBatches().catch(console.error);

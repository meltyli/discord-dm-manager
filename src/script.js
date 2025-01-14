const fs = require('fs');
const path = require('path');
const request = require('request');

// --- CONFIG ---
const authorizationtoken = 'mfa.YOUR_TOKEN_HERE'; // Replace with your Discord token
const datapackagemessagefolder = '/path/to/your/discord/package/messages'; // Your path to the messages folder
const myDiscordid = 'your_discord_id_here'; // Replace with your Discord ID
const BATCH_SIZE = 100;
let channeljsonpaths = [];

// Traverse through the data package to find all channel.json files
function traverseDataPackage(packagepath) {
    try {
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
    } catch (error) {
        console.error('Error accessing directory:', error);
        throw error;
    }
}

// Get all recipient IDs from the channel.json files
function getrecipients(channeljsonpaths, mydiscordID) {
    let recipientsids = [];
    let processedFiles = 0;
    let dmChannels = 0;

    console.log(`Found ${channeljsonpaths.length} channel.json files to process`);

    for (var i = 0; i < channeljsonpaths.length; i++) {
        try {
            var data = fs.readFileSync(channeljsonpaths[i], 'utf8');
            let channeljson = JSON.parse(data.trim());
            
            if (channeljson.type === "DM") {
                dmChannels++;
                // For each DM channel, find the recipient that isn't us
                channeljson.recipients.forEach(function(value) {
                    if (value !== mydiscordID) {
                        recipientsids.push(value);
                        console.log(`Found DM recipient: ${value}`);
                    }
                });
            }
            processedFiles++;
            
            if (processedFiles % 10 === 0) {
                console.log(`Processed ${processedFiles}/${channeljsonpaths.length} files...`);
            }
        } catch (error) {
            console.error(`Error processing file ${channeljsonpaths[i]}:`, error);
            continue;
        }
    }
    
    console.log(`\nProcessing complete:`);
    console.log(`Total files processed: ${processedFiles}`);
    console.log(`DM channels found: ${dmChannels}`);
    console.log(`Unique recipients found: ${recipientsids.length}`);
    
    return recipientsids;
}

// Get currently open DMs
function getcurrentopendms(authorizationtoken) {
    return new Promise(function (resolve, reject) {
        request({
            method: 'get',
            url: 'https://discord.com/api/v9/users/@me/channels',
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
            url: 'https://discord.com/api/v9/users/@me/channels',
            headers: {
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
            url: `https://discord.com/api/v9/channels/${channelId}`,
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

// Helper function for delays
function delay(time) {
    return new Promise(function (resolve) {
        setTimeout(resolve, time)
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

async function processDMsInBatches() {
    console.log('Starting DM processing...');
    
    // Get all historical DM recipients
    traverseDataPackage(datapackagemessagefolder);
    const allDmids = getrecipients(channeljsonpaths, myDiscordid);
    
    if (allDmids.length === 0) {
        console.log('No DM recipients found. Please check your Discord ID and data package path.');
        return;
    }
    
    // Close all current DMs first
    const currentDMs = await getcurrentopendms(authorizationtoken);
    const currentDMsJson = JSON.parse(currentDMs);
    
    console.log(`\nClosing ${currentDMsJson.length} currently open DMs...`);
    for (const dm of currentDMsJson) {
        if (dm.type === 1) { // Discord API uses type 1 for DMs
            console.log(`Closing DM channel: ${dm.id}`);
            await closeDM(authorizationtoken, dm.id);
            await delay(1000); // Respect rate limits
        }
    }
    
    // Process in batches
    const totalBatches = Math.ceil(allDmids.length / BATCH_SIZE);
    
    console.log(`\nProcessing ${allDmids.length} DMs in ${totalBatches} batches of ${BATCH_SIZE}`);
    
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
    
    console.log('\nAll batches processed!');
}

// Run the script
processDMsInBatches().catch(error => {
    console.error('Error in main process:', error);
    process.exit(1);
});

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
        console.error('Error in traverseDataPackage:', error);
        throw error;
    }
}

// Get all recipient IDs from the channel.json files
function getrecipients(channeljsonpaths, mydiscordID) {
    let recipientsids = [];
    for (var i = 0; i < channeljsonpaths.length; i++) {
        try {
            console.log(`Processing file: ${channeljsonpaths[i]}`);
            var data = fs.readFileSync(channeljsonpaths[i], 'utf8');
            let channeljson = JSON.parse(data.trim());
            
            if (channeljson.type === "DM") {
                channeljson.recipients.forEach(function(value) {
                    if (value != mydiscordID) {
                        recipientsids.push(value);
                        console.log(`Found recipient: ${value}`);
                    }
                });
            }
        } catch (error) {
            console.error(`Error processing file ${channeljsonpaths[i]}:`, error);
            continue;
        }
    }
    console.log(`Total recipients found: ${recipientsids.length}`);
    return recipientsids;
}

// Rest of the functions remain the same...
[Previous functions: getcurrentopendms, reopendm, closeDM, waitForKeyPress, delay, processDMsInBatches]

// Run the script with error handling
try {
    processDMsInBatches().catch(error => {
        console.error('Error in main process:', error);
        process.exit(1);
    });
} catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
}

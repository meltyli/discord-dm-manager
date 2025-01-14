const fs = require('fs');
const path = require('path');
const request = require('request');

// --- CONFIG ---
const authorizationtoken = 'mfa.longrandomstring';
const datapackagemessagefolder = 'D:\\discordDataPackage\\messages';
const myDiscordid = '000000000000000000';
const BATCH_SIZE = 100;
let channeljsonpaths = [];

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

// ex usage: traverseDataPackage('D:\\discord-data-package\\messages')
function traverseDataPackage(packagepath)
{
    let files = fs.readdirSync(packagepath);
    files.forEach(function (file, index) {
        var currpath = path.join(packagepath, file);
        let filestat = fs.statSync(currpath);
        if (filestat.isFile())
        {
            if (currpath.includes("channel.json"))
            {
                channeljsonpaths.push(currpath);
            }
        }
        else if (filestat.isDirectory())
        {
            traverseDataPackage(currpath);
        } 
    });
}

// ex usage:  getrecipients(channeljsonpaths, '000000000000000000')
function getrecipients(channeljsonpaths, mydiscordID)
{
    let recipientsids = [];
    for (var i = 0; i < channeljsonpaths.length; i++){
        var data = fs.readFileSync(channeljsonpaths[i]);
        let channeljson = JSON.parse(data);
        // when channeljson.type == 1 then its a DM, since we don't want groupchats, etc
        if (channeljson.type == 1)
        {
            channeljson.recipients.forEach(function(value){
                if (value != mydiscordID) // remove your own id from the recipients (since DM's include both recipients ID's)
                {
                    recipientsids.push(value);
                }
            });
        }
    }
    return recipientsids;
}

// this isnt necessary, since opening a DM with an already opened user isn't an issue, but in this case, we will do this so we don't send requests for DM's already opened
// ex usage: getcurrentopendms('authtoken here')    where the authtoken starts with mfa.longstringhere. You can get this by opening devtools and looking for the request header "Authorization" when making discord requests
async function getcurrentopendms(authorizationtoken)
{
    return new Promise(function (resolve, reject) {
        const request = require('request');
        request({
            method: 'get',
            url: 'https://discordapp.com/api/users/@me/channels',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authorizationtoken
            }
        }, (err, resp, body) => {
            if (err)
            {
                console.log(err);
            }
            return resolve(body);
        })
        .on('error', function (e) {
            console.log(e);
        })
        .on('timeout', function(e) {
            console.log(e);
        })
        .on('uncaughtException', function(e) {
            console.log(e);
        });
    });
}

// ex uage: opendm("mfa.longstringherethatyougetfromdevtoolsetc", "000000000000000000");
function reopendm(authorizationtoken, userid)
{
    const request = require('request');

    var options = { method: 'POST',
    url: 'https://discordapp.com/api/users/@me/channels',
    headers: 
     { 'cache-control': 'no-cache',
       Host: 'discordapp.com',
       'Cache-Control': 'no-cache',
       Accept: '*/*',
       Authorization: authorizationtoken,
       'Content-Type': 'application/json' },
    body: { recipients: [ userid ] },
    json: true };
  
  request(options, function (error, response, body) {
    if (error) throw new Error(error);
    console.log(body);
  });
}

function delay(time) {
    return new Promise(function (resolve) {
        setTimeout(resolve, time)
    });
}

// run the script
processDMsInBatches().catch(console.error);

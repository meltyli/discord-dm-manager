const readline = require('readline');
const { spawn } = require('child_process');
const path = require('path');
const cliProgress = require('cli-progress');

async function promptUser(question, readlineInterface) {
    return new Promise((resolve) => {
        readlineInterface.question(question, resolve);
    });
}

async function promptConfirmation(message, readlineInterface, options = { acceptY: true, acceptYes: true }) {
    const answer = await promptUser(message, readlineInterface);
    const cleaned = answer.trim().toLowerCase();
    
    if (options.acceptYes && cleaned === 'yes') return true;
    if (options.acceptY && cleaned === 'y') return true;
    
    return false;
}

async function waitForKeyPress(readlineInterface, message = '\nPress Enter to continue...') {
    return new Promise((resolve) => {
        readlineInterface.question(message, () => {
            resolve();
        });
    });
}

// Safe wrapper that handles closed readline gracefully
async function safeWaitForKeyPress(readlineInterface, message = '\nPress Enter to continue...') {
    if (!readlineInterface || readlineInterface.closed) {
        return;
    }
    
    try {
        await waitForKeyPress(readlineInterface, message);
    } catch (error) {
        if (error && error.message && error.message.includes('readline was closed')) {
            return;
        }
        throw error;
    }
}

async function getMenuChoice(readlineInterface, prompt = '\nSelect an option: ') {
    const choice = await promptUser(prompt, readlineInterface);
    return choice.trim().toLowerCase();
}

function clearScreen() {
    console.clear();
}

function cleanInput(input) {
    const trimmed = input.trim();
    // If the input is fully quoted, extract the quoted content
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || 
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1).trim();
    }
    // Otherwise just trim whitespace
    return trimmed;
}

async function runDCEExportChannel(token, exportPath, dcePath, format, userId, channelId, channelName = 'Unknown', afterTimestamp = null) {
    return new Promise((resolve, reject) => {
        const dceExecutable = path.join(dcePath, 'DiscordChatExporter.Cli');
        
        const args = [
            'export',
            '-t', token,
            '-c', channelId,
            '-o', `${exportPath}/${userId}/Direct Messages/${channelId}/${channelName} - %d/`,
            '--partition', '10MB',
            '--format', format,
            '--media-dir', `${exportPath}/media`,
            '--media',
            '--reuse-media',
            '--respect-rate-limits',
            '--markdown false',
            '--fuck-russia'
        ];
        
        if (afterTimestamp) {
            args.push('--after', afterTimestamp);
        }

        const dceProcess = spawn(dceExecutable, args, {
            stdio: ['ignore', 'pipe', 'pipe']
        });
        
        let lastOutput = '';
        
        dceProcess.stdout.on('data', (data) => {
            lastOutput = data.toString();
        });
        
        dceProcess.stderr.on('data', (data) => {
            lastOutput = data.toString();
        });
        
        dceProcess.on('close', (code) => {
            if (code === 0) {
                resolve({ success: true, channelId, channelName });
            } else {
                reject(new Error(`DCE exited with code ${code} for ${channelName}`));
            }
        });
        
        dceProcess.on('error', (error) => {
            reject(new Error(`Failed to start DCE for ${channelName}: ${error.message}`));
        });
    });
}

async function exportChannelsInParallel(token, exportPath, dcePath, format, userId, channels, concurrency = 2, idHistoryPath = null) {
    const results = [];
    let completed = 0;
    let activeCount = 0;
    const maxActive = 2;
    
    const { getExportStatus, updateExportStatus } = require('./file-utils');
    const exportStatuses = idHistoryPath ? getExportStatus(idHistoryPath) : {};
    
    for (let i = 0; i < channels.length; i++) {
        const channel = channels[i];
        const recipient = channel.recipients && channel.recipients[0];
        const username = recipient?.username || channel.name || 'Unknown';
        const recipientId = recipient?.id || 'Unknown ID';
        const displayName = `${username} (${recipientId})`;
        
        while (activeCount >= maxActive) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        activeCount++;
        process.stdout.write(`\r\x1b[K⏳ ${displayName} (${completed + 1}/${channels.length})...`);
        
        (async () => {
            try {
                const channelStatus = exportStatuses[recipientId];
                const afterTimestamp = channelStatus?.status === 'completed' ? channelStatus.timestamp : null;
                
                if (idHistoryPath) {
                    updateExportStatus(idHistoryPath, recipientId, 'in-progress', username);
                }
                
                const result = await runDCEExportChannel(
                    token, 
                    exportPath, 
                    dcePath, 
                    format, 
                    userId, 
                    channel.id, 
                    username,
                    afterTimestamp
                );
                
                completed++;
                process.stdout.write(`\r\x1b[K✓ ${displayName} (${completed}/${channels.length})\n`);
                results.push(result);
                
                if (idHistoryPath) {
                    updateExportStatus(idHistoryPath, recipientId, 'completed', username);
                }
            } catch (error) {
                completed++;
                process.stdout.write(`\r\x1b[K✗ ${displayName}: ${error.message} (${completed}/${channels.length})\n`);
                results.push({ success: false, channelId: channel.id, channelName: displayName, error: error.message });
                
                if (idHistoryPath) {
                    updateExportStatus(idHistoryPath, recipientId, 'failed', username);
                }
            } finally {
                activeCount--;
            }
        })();
        
        if (i < channels.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    
    while (activeCount > 0 || completed < channels.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return results;
}

async function exportDMs(token, exportPath, dcePath, userId, formats = ['Json'], channels = null, concurrency = 2, idHistoryPath = null) {
    if (!channels) {
        console.error('No channels provided for export');
        return { success: false, results: [] };
    }
    
    const allResults = [];
    
    for (const format of formats) {
        console.log(`\nExporting ${channels.length} channel(s) in ${format} format...`);
        console.log('═'.repeat(60));
        
        try {
            const results = await exportChannelsInParallel(
                token, 
                exportPath, 
                dcePath, 
                format, 
                userId, 
                channels,
                concurrency,
                idHistoryPath
            );
            
            const successCount = results.filter(r => r.success).length;
            const failCount = results.filter(r => !r.success).length;
            
            console.log('═'.repeat(60));
            console.log(`${format} export completed: ${successCount} succeeded, ${failCount} failed\n`);
            allResults.push({ format, success: failCount === 0, results });
        } catch (error) {
            console.log('═'.repeat(60));
            console.error(`${format} export failed: ${error.message}`);
            allResults.push({ format, success: false, error: error.message });
        }
    }
    
    const allSucceeded = allResults.every(r => r.success);
    return { success: allSucceeded, results: allResults };
}

function createDMProgressBar(label = 'DMs') {
    return new cliProgress.SingleBar({
        format: `Progress |{bar}| {percentage}% || {value}/{total} ${label}`,
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591'
    });
}

module.exports = {
    promptUser,
    promptConfirmation,
    waitForKeyPress,
    safeWaitForKeyPress,
    getMenuChoice,
    clearScreen,
    cleanInput,
    runDCEExportChannel,
    exportChannelsInParallel,
    exportDMs,
    createDMProgressBar
};

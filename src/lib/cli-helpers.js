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
    return input.trim().replace(/^['"]|['"]$/g, '');
}

async function runDCEExport(token, exportPath, dcePath, format, userId) {
    return new Promise((resolve, reject) => {
        const dceExecutable = path.join(dcePath, 'DiscordChatExporter.Cli');
        
        const args = [
            'exportdm',
            '-t', token,
            '-o', `${exportPath}/${userId}/%G/%c/%C - %d/`,
            '--partition', '10MB',
            '--format', format,
            '--media-dir', `${exportPath}/media`,
            '--media',
            '--reuse-media',
            '--parallel', '4',
            '--respect-rate-limits',
            '--fuck-russia'
        ];

        const dceProcess = spawn(dceExecutable, args);
        
        dceProcess.stdout.on('data', (data) => {
            process.stdout.write(data.toString());
        });

        dceProcess.stderr.on('data', (data) => {
            process.stderr.write(data.toString());
        });
        
        dceProcess.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`DCE exited with code ${code}`));
            }
        });
        
        dceProcess.on('error', (error) => {
            reject(new Error(`Failed to start DCE: ${error.message}`));
        });
    });
}

async function exportDMs(token, exportPath, dcePath, userId, formats = ['Json']) {
    const results = [];
    
    for (const format of formats) {
        console.log(`\nExporting in ${format} format...`);
        console.log('═'.repeat(60));
        console.log('Discord Chat Exporter Output:');
        console.log('═'.repeat(60));
        
        try {
            await runDCEExport(token, exportPath, dcePath, format, userId);
            
            console.log('═'.repeat(60));
            console.log('Discord Chat Exporter Finished');
            console.log('═'.repeat(60));
            console.log(`${format} export completed.\n`);
            results.push({ format, success: true });
        } catch (error) {
            console.log('═'.repeat(60));
            console.log('Discord Chat Exporter Finished (with errors)');
            console.log('═'.repeat(60));
            console.error(`${format} export failed: ${error.message}`);
            results.push({ format, success: false, error: error.message });
        }
    }
    
    // Return overall success (all formats succeeded)
    const allSucceeded = results.every(r => r.success);
    return { success: allSucceeded, results };
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
    runDCEExport,
    exportDMs,
    createDMProgressBar
};

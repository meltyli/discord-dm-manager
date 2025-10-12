const readline = require('readline');
const { spawn } = require('child_process');
const path = require('path');
const cliProgress = require('cli-progress');

/**
 * Unified readline prompting wrapper
 * @param {string} question - The question to ask
 * @param {readline.Interface} readlineInterface - Readline interface to use
 * @returns {Promise<string>} User's answer
 */
async function promptUser(question, readlineInterface) {
    return new Promise((resolve) => {
        readlineInterface.question(question, resolve);
    });
}

/**
 * Yes/no confirmation prompt
 * @param {string} message - Confirmation message
 * @param {readline.Interface} readlineInterface - Readline interface to use
 * @param {Object} options - Acceptance options
 * @returns {Promise<boolean>} True if confirmed
 */
async function promptConfirmation(message, readlineInterface, options = { acceptY: true, acceptYes: true }) {
    const answer = await promptUser(message, readlineInterface);
    const cleaned = answer.trim().toLowerCase();
    
    if (options.acceptYes && cleaned === 'yes') return true;
    if (options.acceptY && cleaned === 'y') return true;
    
    return false;
}

/**
 * Wait for user to press Enter
 * @param {readline.Interface} readlineInterface - Readline interface to use
 * @param {string} message - Message to display
 * @returns {Promise<void>}
 */
async function waitForKeyPress(readlineInterface, message = '\nPress Enter to continue...') {
    return new Promise((resolve) => {
        readlineInterface.question(message, () => {
            resolve();
        });
    });
}

/**
 * Get menu choice input
 * @param {readline.Interface} readlineInterface - Readline interface to use
 * @param {string} prompt - Prompt message
 * @returns {Promise<string>} Trimmed lowercase choice
 */
async function getMenuChoice(readlineInterface, prompt = '\nSelect an option: ') {
    const choice = await promptUser(prompt, readlineInterface);
    return choice.trim().toLowerCase();
}

/**
 * Clear the console screen
 */
function clearScreen() {
    console.clear();
}

/**
 * Clean input by trimming and removing leading/trailing quotes
 * @param {string} input - Input string to clean
 * @returns {string} Cleaned string
 */
function cleanInput(input) {
    return input.trim().replace(/^['"]|['"]$/g, '');
}

/**
 * Semantic alias for cleanInput in path contexts
 * @param {string} input - Path string to clean
 * @returns {string} Cleaned path string
 */
function formatPath(input) {
    return cleanInput(input);
}

/**
 * Execute Discord Chat Exporter for a specific format
 * @param {string} token - Discord authorization token
 * @param {string} exportPath - Base export directory path
 * @param {string} dcePath - Path to DCE installation directory
 * @param {string} format - Export format (e.g., 'Json', 'HtmlDark')
 * @returns {Promise<void>} Resolves on success, rejects on error
 */
async function runDCEExport(token, exportPath, dcePath, format) {
    return new Promise((resolve, reject) => {
        const dceExecutable = path.join(dcePath, 'DiscordChatExporter.Cli');
        
        const args = [
            'exportdm',
            '-t', token,
            '-o', `${exportPath}/%G/%c/%C - %d/`,
            '--partition', '10MB',
            '--format', format,
            '--media-dir', `${exportPath}/media`,
            '--media',
            '--reuse-media',
            '--parallel', '4'
        ];

        const dceProcess = spawn(dceExecutable, args);
        
        dceProcess.stdout.on('data', (data) => {
            console.log(data.toString().trim());
        });
        
        dceProcess.stderr.on('data', (data) => {
            console.error(data.toString().trim());
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

/**
 * Export DMs in multiple formats using Discord Chat Exporter
 * @param {string} token - Discord authorization token
 * @param {string} exportPath - Base export directory path
 * @param {string} dcePath - Path to DCE installation directory
 * @param {string[]} formats - Array of export formats (default: ['Json', 'HtmlDark'])
 * @returns {Promise<void>} Resolves when all formats exported, rejects on error
 */
async function exportDMs(token, exportPath, dcePath, formats = ['Json', 'HtmlDark']) {
    for (const format of formats) {
        console.log(`Exporting in ${format} format...`);
        
        try {
            await runDCEExport(token, exportPath, dcePath, format);
            console.log(`${format} export completed.`);
        } catch (error) {
            console.error(`${format} export failed: ${error.message}`);
            throw error;
        }
    }
}

/**
 * Create a standardized progress bar for DM operations
 * @param {string} label - Label for the items being tracked (default: 'DMs')
 * @returns {cliProgress.SingleBar} Configured progress bar instance
 */
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
    getMenuChoice,
    clearScreen,
    cleanInput,
    formatPath,
    runDCEExport,
    exportDMs,
    createDMProgressBar
};

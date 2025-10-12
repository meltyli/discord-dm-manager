const readline = require('readline');

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

module.exports = {
    promptUser,
    promptConfirmation,
    waitForKeyPress,
    getMenuChoice,
    clearScreen,
    cleanInput,
    formatPath
};

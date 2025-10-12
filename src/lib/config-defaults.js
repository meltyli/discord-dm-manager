const { ensureExportPath } = require('./file-utils');
const { promptUser, cleanInput } = require('./cli-helpers');

/**
 * Handles export path defaulting logic
 * @param {string} input - User input for export path
 * @returns {string} Resolved export path (defaults to 'export' if empty)
 */
function resolveExportPath(input) {
    return ensureExportPath(input);
}

/**
 * Prompts for and processes a configuration value
 * @param {string} key - Configuration key name
 * @param {string} currentValue - Current value
 * @param {readline.Interface} rlInterface - Readline interface
 * @returns {Promise<string>} Processed configuration value
 */
async function promptForConfigValue(key, currentValue, rlInterface) {
    const answer = await promptUser(`Enter value for ${key}: `, rlInterface);
    const cleaned = cleanInput(answer);
    
    // Handle EXPORT_PATH defaulting
    if (key === 'EXPORT_PATH') {
        return resolveExportPath(cleaned);
    }
    
    return cleaned;
}

module.exports = {
    resolveExportPath,
    promptForConfigValue
};

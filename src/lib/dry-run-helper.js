const { getConfigManager } = require('../config');

const configManager = getConfigManager();

/**
 * Checks if DRY_RUN mode is enabled and executes mock or actual function
 * @param {string} actionName - Name of the action for logging
 * @param {Function} dryRunFn - Function to execute in DRY_RUN mode (receives no args)
 * @param {Function} actualFn - Async function to execute in normal mode
 * @returns {Promise<any>} Result from either dryRunFn or actualFn
 */
async function withDryRun(actionName, dryRunFn, actualFn) {
    if (configManager.get('DRY_RUN')) {
        console.log(`[DRY RUN] ${actionName}`);
        return dryRunFn();
    }
    return await actualFn();
}

/**
 * Simple DRY_RUN check that returns early if enabled
 * @param {string} actionName - Name of the action for logging
 * @param {any} mockReturnValue - Value to return in DRY_RUN mode
 * @returns {boolean} True if in DRY_RUN mode (caller should return), false otherwise
 */
function checkDryRun(actionName, mockReturnValue = null) {
    if (configManager.get('DRY_RUN')) {
        console.log(`[DRY RUN] ${actionName}`);
        return { isDryRun: true, mockValue: mockReturnValue };
    }
    return { isDryRun: false };
}

/**
 * Checks if DRY_RUN mode is enabled
 * @returns {boolean} True if DRY_RUN is enabled
 */
function isDryRun() {
    return configManager.get('DRY_RUN');
}

module.exports = {
    withDryRun,
    checkDryRun,
    isDryRun
};

const path = require('path');
const { validatePathExists, validateUserJson, validateDataPackage } = require('./validators');
const { readJsonFile } = require('./file-utils');
const { promptUser, promptConfirmation, cleanInput } = require('./cli-helpers');

/**
 * Verifies user ID against data package user.json
 * @param {string} dataPackagePath - Path to Discord data package
 * @param {readline.Interface} rlInterface - Readline interface for prompts
 * @returns {Promise<string>} Verified user ID
 */
async function verifyUserId(dataPackagePath, rlInterface) {
    const userJsonPath = path.join(dataPackagePath, 'account', 'user.json');
    const validation = validateUserJson(userJsonPath);
    
    if (!validation.valid) {
        console.warn(`Warning: ${validation.error}`);
        return null;
    }

    const { userId: packageUserId, username: packageUsername } = validation;
    console.log(`\nFound user in data package: ${packageUsername} (ID: ${packageUserId})`);
    
    const providedUserId = cleanInput(await promptUser(`Provide user ID for user ${packageUsername}: `, rlInterface));
    
    if (providedUserId !== packageUserId) {
        console.warn(`\nWARNING: The provided ID (${providedUserId}) doesn't match the data package ID (${packageUserId})`);
        
        if (!await promptConfirmation('Are you sure you want to proceed? (yes/no): ', rlInterface)) {
            throw new Error('User ID verification failed. Setup cancelled.');
        }
    } else {
        console.log('✓ User ID verified successfully!');
    }
    
    return providedUserId;
}

/**
 * Validates and repairs configuration paths
 * @param {Object} config - Configuration object to validate
 * @param {string[]} pathKeys - Array of path keys to validate
 * @param {readline.Interface} rlInterface - Readline interface for prompts
 * @param {Function} ensureExportPathFn - Function to handle EXPORT_PATH defaulting
 * @returns {Promise<boolean>} True if any paths were updated
 */
async function validateConfigPaths(config, pathKeys, rlInterface, ensureExportPathFn) {
    let updated = false;
    
    for (const pathKey of pathKeys) {
        const pathValue = config[pathKey];
        if (!validatePathExists(pathValue, pathKey)) {
            console.warn(`Path ${pathKey} (${pathValue}) does not exist`);
            const newPath = await promptUser(`Enter valid path for ${pathKey}: `, rlInterface);
            const cleaned = cleanInput(newPath);
            
            // Handle EXPORT_PATH defaulting if provided function exists
            if (pathKey === 'EXPORT_PATH' && ensureExportPathFn) {
                config[pathKey] = ensureExportPathFn(cleaned);
            } else {
                config[pathKey] = cleaned;
            }
            updated = true;
        }
    }
    
    return updated;
}

module.exports = {
    verifyUserId,
    validateConfigPaths
};

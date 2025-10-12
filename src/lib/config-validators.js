const path = require('path');
const { validatePathExists, readJsonFile } = require('./file-utils');
const { promptUser, promptConfirmation, cleanInput } = require('./cli-helpers');

/**
 * Verifies user ID against data package user.json
 * @param {string} dataPackagePath - Path to Discord data package
 * @param {readline.Interface} rlInterface - Readline interface for prompts
 * @returns {Promise<string>} Verified user ID
 */
async function verifyUserId(dataPackagePath, rlInterface) {
    const userJsonPath = path.join(dataPackagePath, 'account', 'user.json');
    
    if (!validatePathExists(userJsonPath, 'user.json')) {
        console.warn(`Warning: user.json not found at ${userJsonPath}`);
        return null;
    }

    try {
        const userData = readJsonFile(userJsonPath);
        if (!userData) {
            console.warn(`Could not read user.json at ${userJsonPath}`);
            return null;
        }
        
        const packageUserId = userData.id;
        const packageUsername = userData.username;
        
        console.log(`\nFound user in data package: ${packageUsername} (ID: ${packageUserId})`);
        
        // Prompt for user ID
        const providedUserId = cleanInput(await promptUser(`Provide user ID for user ${packageUsername}: `, rlInterface));
        
        // Compare IDs
        if (providedUserId !== packageUserId) {
            console.warn(`\nWARNING: The provided ID (${providedUserId}) doesn't match the data package ID (${packageUserId})`);
            
            if (!await promptConfirmation('Are you sure you want to proceed? (yes/no): ', rlInterface)) {
                throw new Error('User ID verification failed. Setup cancelled.');
            }
        } else {
            console.log('✓ User ID verified successfully!');
        }
        
        return providedUserId;
    } catch (error) {
        if (error.message.includes('Setup cancelled')) {
            throw error;
        }
        console.error(`Error reading user.json: ${error.message}`);
        return null;
    }
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

/**
 * Validates data package directory structure
 * @param {string} packagePath - Path to data package directory
 * @returns {boolean} True if valid
 */
function validateDataPackage(packagePath) {
    // Verify path exists
    if (!validatePathExists(packagePath, 'Data package directory', true)) {
        return false;
    }
    
    // Verify it has messages folder
    const messagesPath = path.join(packagePath, 'messages');
    if (!validatePathExists(messagesPath, 'Messages folder', true)) {
        return false;
    }
    
    return true;
}

module.exports = {
    verifyUserId,
    validateConfigPaths,
    validateDataPackage
};

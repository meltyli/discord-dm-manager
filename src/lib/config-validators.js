const path = require('path');
const { validatePathExists, validateUserJson, validateDataPackage } = require('./validators');
const { readJsonFile } = require('./file-utils');
const { promptUser, promptConfirmation, cleanInput } = require('./cli-helpers');
const { getUserJsonPath } = require('./path-utils');

/**
 * Verifies user ID against data package user.json
 * @param {string} dataPackagePath - Path to Discord data package
 * @param {readline.Interface} rlInterface - Readline interface for prompts
 * @param {string} existingUserId - Optional existing user ID to verify
 * @returns {Promise<string>} Verified user ID
 */
async function verifyUserId(dataPackagePath, rlInterface, existingUserId = null) {
    const userJsonPath = getUserJsonPath(dataPackagePath);
    const validation = validateUserJson(userJsonPath);
    
    if (!validation.valid) {
        console.warn(`\nWarning: ${validation.error}`);
        // If no user.json available, prompt for user ID if not already provided
        if (!existingUserId) {
            const providedUserId = cleanInput(await promptUser('Enter your Discord user ID: ', rlInterface));
            return providedUserId;
        }
        return existingUserId;
    }

    const { userId: packageUserId, username: packageUsername } = validation;
    console.log(`\nFound user in data package: ${packageUsername} (ID: ${packageUserId})`);
    
    let providedUserId;
    
    // If user ID already exists, verify it matches the package
    if (existingUserId) {
        providedUserId = existingUserId;
        if (providedUserId !== packageUserId) {

            console.warn(`\n${yellow}⚠ WARNING:${reset} Your configured user ID (${providedUserId}) doesn't match the data package user ID (${packageUserId})`);
            console.warn(`  Package user: ${packageUsername}`);
            
            const shouldContinue = await promptConfirmation('\nDo you want to continue with the configured ID? (y/n): ', rlInterface);
            
            if (!shouldContinue) {
                console.log('Updating to use data package user ID...');
                providedUserId = packageUserId;
            }
        } else {

            console.log(`${green}✓ User ID matches data package!${reset}`);
        }
    } else {
        // No existing ID, prompt for it
        providedUserId = cleanInput(await promptUser(`Enter user ID for ${packageUsername} (or press Enter to use ${packageUserId}): `, rlInterface));
        
        // If empty, use package ID
        if (!providedUserId) {
            providedUserId = packageUserId;
            console.log(`Using data package user ID: ${packageUserId}`);
        } else if (providedUserId !== packageUserId) {

            console.warn(`\n${yellow}⚠ WARNING:${reset} The provided ID (${providedUserId}) doesn't match the data package ID (${packageUserId})`);
            
            const shouldContinue = await promptConfirmation('Are you sure you want to proceed? (y/n): ', rlInterface);
            if (!shouldContinue) {
                throw new Error('User ID verification cancelled.');
            }
        } else {

            console.log(`${green}✓ User ID verified successfully!${reset}`);
        }
    }
    
    return providedUserId;
}

/**
 * Validates and creates missing configuration paths
 * @param {Object} config - Configuration object to validate
 * @param {string[]} pathKeys - Array of path keys to validate
 * @param {readline.Interface} rlInterface - Readline interface for prompts
 * @param {Function} ensureExportPathFn - Function to handle EXPORT_PATH defaulting
 * @returns {Promise<boolean>} True if any paths were created
 */
async function validateConfigPaths(config, pathKeys, rlInterface, ensureExportPathFn) {
    const fs = require('fs');
    const missingPaths = [];
    
    for (const pathKey of pathKeys) {
        const pathValue = config[pathKey];
        if (pathValue && !validatePathExists(pathValue)) {
            missingPaths.push({ key: pathKey, path: pathValue });
        }
    }
    
    if (missingPaths.length === 0) {
        return false;
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('The following directories do not exist:');
    missingPaths.forEach(({ key, path }) => {
        console.log(`  ${key}: ${path}`);
    });
    console.log('='.repeat(60));
    
    const shouldCreate = await promptConfirmation(
        missingPaths.length === 1 
            ? 'Would you like to create this directory? (y/n): '
            : 'Would you like to create these directories? (y/n): ',
        rlInterface
    );
    
    if (!shouldCreate) {
        throw new Error('Cannot proceed without valid directories. Setup cancelled.');
    }
    
    // Create directories
    const { ensureDirectory } = require('./file-utils');
    for (const { key, path: dirPath } of missingPaths) {
        try {
            ensureDirectory(dirPath);
            console.log(`✓ Created: ${dirPath}`);
        } catch (error) {
            console.error(`✗ Failed to create ${key} (${dirPath}): ${error.message}`);
            throw new Error(`Could not create directory: ${dirPath}`);
        }
    }
    
    return true;
}

module.exports = {
    verifyUserId,
    validateConfigPaths
};

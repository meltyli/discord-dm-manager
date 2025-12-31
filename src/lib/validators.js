const fs = require('fs');
const path = require('path');

/**
 * Core validation framework with consistent error handling and reporting
 */

class ValidationError extends Error {
    constructor(message, field, value) {
        super(message);
        this.name = 'ValidationError';
        this.field = field;
        this.value = value;
    }
}

/**
 * Validates that a value exists (not null, undefined, or empty string)
 */
function validateRequired(value, fieldName, friendlyName) {
    if (!value) {
        throw new ValidationError(
            `${fieldName} not configured. Please configure ${friendlyName} in Configuration menu.`,
            fieldName,
            value
        );
    }
    return value;
}

/**
 * Validates that a path exists on the filesystem
 */
function validatePathExists(pathValue, pathName, throwOnError = false) {
    const exists = fs.existsSync(pathValue);
    
    if (!exists && throwOnError) {
        throw new ValidationError(
            `${pathName} does not exist: ${pathValue}`,
            pathName,
            pathValue
        );
    }
    
    return exists;
}

/**
 * Validates DCE (Discord Chat Exporter) installation path
 */
function validateDCEPath(dcePath) {
    validateRequired(dcePath, 'DCE_PATH', 'Discord Chat Exporter path');
    
    const dceExecutable = path.join(dcePath, 'DiscordChatExporter.Cli');
    
    if (!fs.existsSync(dceExecutable) && !fs.existsSync(dceExecutable + '.exe')) {
        throw new ValidationError(
            `Discord Chat Exporter not found at: ${dceExecutable}. Please verify DCE_PATH in Configuration menu.`,
            'DCE_PATH',
            dcePath
        );
    }
    
    return dceExecutable;
}

/**
 * Validates Discord data package directory structure
 */
function validateDataPackage(packagePath) {
    validatePathExists(packagePath, 'Data package directory', true);
    
    const messagesPath = path.join(packagePath, 'messages');
    validatePathExists(messagesPath, 'Messages folder', true);
    
    return true;
}

/**
 * Batch validation of multiple paths with consistent error handling
 */
function validatePaths(paths) {
    const results = [];
    const errors = [];
    
    for (const { path: pathValue, name, required = false } of paths) {
        try {
            const exists = validatePathExists(pathValue, name, required);
            results.push({ path: pathValue, name, exists, valid: true });
        } catch (error) {
            errors.push({ path: pathValue, name, error: error.message });
            results.push({ path: pathValue, name, exists: false, valid: false });
        }
    }
    
    return { results, errors, valid: errors.length === 0 };
}

/**
 * Validates user.json file structure
 */
function validateUserJson(userJsonPath) {
    if (!validatePathExists(userJsonPath, 'user.json')) {
        return { valid: false, error: `user.json not found at ${userJsonPath}` };
    }
    
    try {
        const content = fs.readFileSync(userJsonPath, 'utf8');
        const userData = JSON.parse(content);
        
        if (!userData.id || !userData.username) {
            return { 
                valid: false, 
                error: 'user.json missing required fields (id, username)' 
            };
        }
        
        return { 
            valid: true, 
            data: userData,
            userId: userData.id,
            username: userData.username
        };
    } catch (error) {
        return { 
            valid: false, 
            error: `Could not read user.json: ${error.message}` 
        };
    }
}

module.exports = {
    ValidationError,
    validateRequired,
    validatePathExists,
    validateDCEPath,
    validateDataPackage,
    validatePaths,
    validateUserJson
};

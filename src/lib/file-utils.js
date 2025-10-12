const fs = require('fs');
const path = require('path');

/**
 * Recursively traverses Discord data package to find all channel.json files
 * @param {string} packagePath - Path to Discord data package root
 * @returns {string[]} Array of absolute paths to channel.json files
 * @throws {Error} If directory cannot be accessed
 */
function traverseDataPackage(packagePath) {
    const channelJsonPaths = [];
    
    function traverse(currentPath) {
        try {
            const files = fs.readdirSync(currentPath);
            files.forEach(file => {
                const fullPath = path.join(currentPath, file);
                const fileStat = fs.statSync(fullPath);
                
                if (fileStat.isFile() && fullPath.includes('channel.json')) {
                    channelJsonPaths.push(fullPath);
                } else if (fileStat.isDirectory()) {
                    traverse(fullPath);
                }
            });
        } catch (error) {
            throw new Error(`Error accessing directory ${currentPath}: ${error.message}`);
        }
    }

    traverse(packagePath);
    return channelJsonPaths;
}

/**
 * Extracts unique recipient IDs from channel.json files (DM and GROUP_DM only)
 * @param {string[]} channelJsonPaths - Array of paths to channel.json files
 * @param {string} myDiscordId - Current user's Discord ID to exclude
 * @returns {string[]} Array of unique recipient Discord IDs
 */
function getRecipients(channelJsonPaths, myDiscordId) {
    const recipientIds = new Set();
    
    channelJsonPaths.forEach(filePath => {
        try {
            const data = fs.readFileSync(filePath, 'utf8');
            const channelJson = JSON.parse(data.trim());
            
            if (channelJson.type === "DM" || channelJson.type === "GROUP_DM") {
                channelJson.recipients.forEach(recipientId => {
                    if (recipientId !== myDiscordId) {
                        recipientIds.add(recipientId);
                    }
                });
            }
        } catch (error) {
            console.error(`Error processing file ${filePath}: ${error.message}`);
        }
    });

    return Array.from(recipientIds);
}

/**
 * Creates directory if it doesn't exist (recursive)
 * @param {string} dirPath - Directory path to create
 * @throws {Error} If directory cannot be created
 */
function ensureDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

/**
 * Validates that a path exists
 * @param {string} pathValue - Path to validate
 * @param {string} pathName - Name of path for error messages
 * @param {boolean} throwOnError - Whether to throw or return boolean
 * @returns {boolean} True if path exists (when not throwing)
 * @throws {Error} If path doesn't exist and throwOnError is true
 */
function validatePathExists(pathValue, pathName, throwOnError = false) {
    const exists = fs.existsSync(pathValue);
    
    if (!exists && throwOnError) {
        throw new Error(`${pathName} does not exist: ${pathValue}`);
    }
    
    return exists;
}

/**
 * Resolves absolute path to config directory file
 * @param {string} filename - Filename in config directory
 * @returns {string} Absolute path to config file
 */
function resolveConfigPath(filename) {
    return path.join(__dirname, '..', '..', 'config', filename);
}

/**
 * Ensures export path exists, defaulting to 'export' if empty
 * @param {string} pathValue - Export path value
 * @returns {string} Cleaned and validated export path
 */
function ensureExportPath(pathValue) {
    const cleaned = pathValue.trim().replace(/^['"]|['"]$/g, '');
    const finalPath = cleaned || 'export';
    
    try {
        const exportPath = path.isAbsolute(finalPath)
            ? finalPath
            : path.join(process.cwd(), finalPath);
        
        ensureDirectory(exportPath);
    } catch (err) {
        console.warn(`Could not create export directory ${finalPath}: ${err.message}`);
    }
    
    return finalPath;
}

/**
 * Safely reads and parses JSON file
 * @param {string} filePath - Path to JSON file
 * @param {*} defaultValue - Default value if file doesn't exist or parse fails
 * @returns {*} Parsed JSON or defaultValue
 */
function readJsonFile(filePath, defaultValue = null) {
    try {
        if (!fs.existsSync(filePath)) {
            return defaultValue;
        }
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        console.error(`Error reading JSON file ${filePath}: ${error.message}`);
        return defaultValue;
    }
}

/**
 * Writes data to JSON file with formatting
 * @param {string} filePath - Path to JSON file
 * @param {*} data - Data to write
 * @param {number} indent - Indentation spaces
 * @throws {Error} If write fails
 */
function writeJsonFile(filePath, data, indent = 2) {
    const dirPath = path.dirname(filePath);
    ensureDirectory(dirPath);
    fs.writeFileSync(filePath, JSON.stringify(data, null, indent));
}

module.exports = {
    traverseDataPackage,
    getRecipients,
    ensureDirectory,
    validatePathExists,
    resolveConfigPath,
    ensureExportPath,
    readJsonFile,
    writeJsonFile
};

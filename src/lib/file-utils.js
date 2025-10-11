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

module.exports = {
    traverseDataPackage,
    getRecipients
};

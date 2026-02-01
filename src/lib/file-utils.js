const fs = require('fs');
const path = require('path');
const { validateRequired, validatePathExists, validateDCEPath } = require('./validators');

function traverseDataPackage(packagePath) {
    const channelJsonPaths = [];
    
    function traverse(currentPath) {
        try {
            const files = fs.readdirSync(currentPath);
            files.forEach(file => {
                if (file.startsWith('._') || file === '.DS_Store' || file === 'Thumbs.db') {
                    return;
                }

                const fullPath = path.join(currentPath, file);
                const fileStat = fs.statSync(fullPath);

                if (fileStat.isFile() && file === 'channel.json') {
                    channelJsonPaths.push(fullPath);
                } else if (fileStat.isDirectory() && !file.startsWith('.')) {
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

function getRecipients(channelJsonPaths, myDiscordId, typeFilter = ['DM', 'GROUP_DM']) {
    const recipientIds = new Set();
    
    channelJsonPaths.forEach(filePath => {
        try {
            const data = fs.readFileSync(filePath, 'utf8');
            const channelJson = JSON.parse(data.trim());
            
            if (typeFilter.includes(channelJson.type)) {
                // Skip if recipients field is missing or not an array
                if (!channelJson.recipients || !Array.isArray(channelJson.recipients)) {
                    return;
                }
                
                // Skip if recipients array is empty
                if (channelJson.recipients.length === 0) {
                    return;
                }
                
                channelJson.recipients.forEach(recipientId => {
                    // Skip if recipient is null, undefined, or the user's own ID
                    if (!recipientId || recipientId === myDiscordId) {
                        return;
                    }
                    
                    // Filter out invalid IDs - only accept numeric strings/numbers
                    const recipientStr = String(recipientId).trim();
                    const isValidId = /^\d+$/.test(recipientStr);
                    
                    if (isValidId) {
                        recipientIds.add(recipientStr);
                    }
                });
            }
        } catch (error) {
            console.error(`Error processing file ${filePath}: ${error.message}`);
        }
    });

    return Array.from(recipientIds);
}

function ensureDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function resolveConfigPath(filename) {
    return path.join(__dirname, '..', '..', 'config', filename);
}

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

function writeJsonFile(filePath, data, indent = 2) {
    const dirPath = path.dirname(filePath);
    ensureDirectory(dirPath);
    
    // Atomic write: write to temp file first, then rename
    const tempFile = `${filePath}.tmp.${Date.now()}`;
    try {
        fs.writeFileSync(tempFile, JSON.stringify(data, null, indent));
        fs.renameSync(tempFile, filePath);
    } catch (error) {
        // Clean up temp file if it exists
        if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
        }
        throw error;
    }
}

/**
 * Strips channel data to only essential fields
 * @param {Object} channel - Full channel object from Discord API
 * @returns {Object} Simplified channel object with only essential data
 */
function stripChannelData(channel) {
    const stripped = {
        id: channel.id,
        type: channel.type
    };
    
    // Only include recipients with essential fields
    if (channel.recipients && Array.isArray(channel.recipients)) {
        stripped.recipients = channel.recipients.map(r => ({
            id: r.id,
            username: r.username,
            global_name: r.global_name
        }));
    }
    
    return stripped;
}

/**
 * Gets user metadata from account/user.json
 * @param {string} idHistoryPath - Path to id-history.json
 * @returns {Object|null} User metadata or null if not found
 */
function getUserMetadata(idHistoryPath) {
    try {
        const accountPath = path.join(path.dirname(path.dirname(idHistoryPath)), 'account', 'user.json');
        const userData = readJsonFile(accountPath, null);
        
        if (userData) {
            return {
                id: userData.id,
                username: userData.username,
                global_name: userData.global_name,
                discriminator: userData.discriminator
            };
        }
    } catch (error) {
        // If we can't read user data, that's okay
    }
    return null;
}

function updateIdHistory(idHistoryPath, currentChannels) {
    const existing = readJsonFile(idHistoryPath, null);
    
    // Strip channels to only essential data
    const strippedChannels = currentChannels.map(stripChannelData);
    
    if (!existing || !existing.originalState) {
        // First run - set originalState and user metadata
        const userMeta = getUserMetadata(idHistoryPath);
        const data = {
            user: userMeta,
            originalState: strippedChannels,
            latest: strippedChannels,
            uniqueChannels: strippedChannels,
            exportStatus: {}
        };
        writeJsonFile(idHistoryPath, data);
    } else {
        // Subsequent runs - preserve originalState and user, update latest and uniqueChannels
        const existingChannelMap = new Map();
        
        // Build map of existing unique channels by id
        if (existing.uniqueChannels && Array.isArray(existing.uniqueChannels)) {
            existing.uniqueChannels.forEach(channel => {
                existingChannelMap.set(channel.id, channel);
            });
        }
        
        // Add new channels to map (will not overwrite existing ones)
        strippedChannels.forEach(channel => {
            if (!existingChannelMap.has(channel.id)) {
                existingChannelMap.set(channel.id, channel);
            }
        });
        
        // Preserve user metadata or get it if missing
        const userMeta = existing.user || getUserMetadata(idHistoryPath);
        
        const data = {
            user: userMeta,
            originalState: existing.originalState,
            latest: strippedChannels,
            uniqueChannels: Array.from(existingChannelMap.values()),
            exportStatus: existing.exportStatus || {}
        };
        writeJsonFile(idHistoryPath, data);
    }
}

function getExportStatus(idHistoryPath) {
    const data = readJsonFile(idHistoryPath, null);
    if (!data || !data.exportStatus) {
        return {};
    }
    return data.exportStatus;
}

function updateExportStatus(idHistoryPath, channelId, status, username = null) {
    const data = readJsonFile(idHistoryPath, null);
    if (!data) {
        throw new Error('id-history.json does not exist. Run closeAllOpenDMs first.');
    }
    
    if (!data.exportStatus) {
        data.exportStatus = {};
    }
    
    const statusEntry = {
        status: status,
        timestamp: new Date().toISOString()
    };
    
    if (username) {
        statusEntry.username = username;
    }
    
    data.exportStatus[channelId] = statusEntry;
    
    writeJsonFile(idHistoryPath, data);
}

function getChannelsToExport(idHistoryPath, recipientIds) {
    const exportStatus = getExportStatus(idHistoryPath);
    
    // Filter out channels that are already completed
    return recipientIds.filter(recipientId => {
        const status = exportStatus[recipientId];
        return !status || status.status !== 'completed';
    });
}

function getCompletedExports(idHistoryPath) {
    const exportStatus = getExportStatus(idHistoryPath);
    return Object.entries(exportStatus)
        .filter(([_, info]) => info.status === 'completed')
        .map(([channelId, _]) => channelId);
}

module.exports = {
    traverseDataPackage,
    getRecipients,
    ensureDirectory,
    resolveConfigPath,
    ensureExportPath,
    readJsonFile,
    writeJsonFile,
    updateIdHistory,
    getExportStatus,
    updateExportStatus,
    getChannelsToExport,
    getCompletedExports
};

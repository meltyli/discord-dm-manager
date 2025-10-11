const fs = require('fs');
const path = require('path');

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

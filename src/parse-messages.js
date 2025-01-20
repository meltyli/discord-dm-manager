const fs = require('fs');
const path = require('path');
const { reopenDM } = require('./discord-dm-manager');

class MessageParser {
    constructor(dataPackagePath, maxMessages = 100) {
        this.dataPackagePath = dataPackagePath;
        this.maxMessages = maxMessages;
        this.messageStack = [];
        this.myDiscordId = process.env.USER_DISCORD_ID;
    }

    parseTimestamp(timestamp) {
        return new Date(timestamp).getTime();
    }

    // Binary search to find insertion position
    findInsertPosition(timestamp) {
        let left = 0;
        let right = this.messageStack.length - 1;

        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const midTimestamp = this.parseTimestamp(this.messageStack[mid].timestamp);
            const newTimestamp = this.parseTimestamp(timestamp);

            if (midTimestamp === newTimestamp) {
                return mid;
            } else if (midTimestamp < newTimestamp) {
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }

        return left;
    }

    // Insert new message in sorted order
    insertMessage(timestamp, recipientId) {
        const position = this.findInsertPosition(timestamp);
        
        // If we're at max capacity and the new message is newer than the oldest
        if (this.messageStack.length >= this.maxMessages) {
            const oldestTimestamp = this.parseTimestamp(this.messageStack[0].timestamp);
            const newTimestamp = this.parseTimestamp(timestamp);
            
            if (newTimestamp > oldestTimestamp) {
                // Remove oldest message
                this.messageStack.shift();
                // Insert new message
                this.messageStack.splice(position - 1, 0, { timestamp, recipientId });
            }
        } else {
            // Just insert if we're under capacity
            this.messageStack.splice(position, 0, { timestamp, recipientId });
        }
    }

    // Get the other user's ID from recipients array
    getOtherUserId(recipients) {
        return recipients.find(id => id !== this.myDiscordId);
    }

    // Process a single channel
    processChannel(channelPath) {
        const channelJsonPath = path.join(channelPath, 'channel.json');
        const messagesJsonPath = path.join(channelPath, 'messages.json');

        try {
            // Read channel.json
            const channelData = JSON.parse(fs.readFileSync(channelJsonPath, 'utf8'));
            
            // Skip if not a DM
            if (channelData.type !== 'DM') {
                return;
            }

            // Verify this is a valid DM with the user
            if (!channelData.recipients.includes(this.myDiscordId)) {
                return;
            }

            const otherUserId = this.getOtherUserId(channelData.recipients);

            // Read first message from messages.json
            const messageContent = fs.readFileSync(messagesJsonPath, 'utf8');
            const firstMessageLine = messageContent.split('\n')[0];
            const firstMessage = JSON.parse(firstMessageLine);

            this.insertMessage(firstMessage.Timestamp, otherUserId);

        } catch (error) {
            console.error(`Error processing channel ${channelPath}: ${error.message}`);
        }
    }

    // Process all channels
    async processAllChannels() {
        const messagesPath = path.join(this.dataPackagePath, 'messages');
        const channels = fs.readdirSync(messagesPath);

        for (const channel of channels) {
            const channelPath = path.join(messagesPath, channel);
            if (fs.statSync(channelPath).isDirectory()) {
                this.processChannel(channelPath);
            }
        }

        return this.messageStack;
    }

    // Reopen DMs for processed messages
    async reopenDMs(authToken) {
        const processedUsers = new Set();

        for (const message of this.messageStack) {
            if (!processedUsers.has(message.recipientId)) {
                try {
                    await reopenDM(authToken, message.recipientId);
                    processedUsers.add(message.recipientId);
                } catch (error) {
                    console.error(`Error reopening DM with user ${message.recipientId}: ${error.message}`);
                }
            }
        }
    }
}

// Usage example
async function main() {
    const parser = new MessageParser(process.env.DATA_PACKAGE_PATH);
    const messages = await parser.processAllChannels();
    await parser.reopenDMs(process.env.AUTHORIZATION_TOKEN);
}

module.exports = {
    MessageParser,
    main
};

if (require.main === module) {
    main().catch(console.error);
}
const axios = require('axios');
const { getConfigManager } = require('./config');
const configManager = getConfigManager();

// Utility functions
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Rate limiting implementation
class RateLimiter {
    constructor(maxRequests, interval) {
        this.maxRequests = maxRequests;
        this.interval = interval;
        this.requests = [];
    }

    async waitForSlot() {
        const now = Date.now();
        this.requests = this.requests.filter(time => time > now - this.interval);
        
        if (this.requests.length >= this.maxRequests) {
            const oldestRequest = this.requests[0];
            const waitTime = oldestRequest + this.interval - now;
            await delay(waitTime);
            return this.waitForSlot();
        }
        
        this.requests.push(now);
    }
}

// Retry mechanism
async function withRetry(operation, description, logger) {
    for (let attempt = 1; attempt <= configManager.get('MAX_RETRIES'); attempt++) {
        try {
            return await operation();
        } catch (error) {
            if (attempt === configManager.get('MAX_RETRIES')) {
                throw error;
            }
            if (logger) {
                logger(`${description} failed, attempt ${attempt}/${configManager.get('MAX_RETRIES')}: ${error.message}`, 'warn');
            }
            await delay(configManager.get('RETRY_DELAY_MS'));
        }
    }
}

// Discord API functions with rate limiting
const rateLimiter = new RateLimiter(configManager.get('RATE_LIMIT_REQUESTS'), configManager.get('RATE_LIMIT_INTERVAL_MS'));

async function getCurrentOpenDMs(authToken) {
    await rateLimiter.waitForSlot();
    return withRetry(async () => {
        const response = await axios.get('https://discord.com/api/v9/users/@me/channels', {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authToken
            }
        });
        return response.data;
    }, 'Fetching current open DMs');
}

// Return true if the user is valid, false if not found (ie. deleted or non-existent)
async function validateUser(authToken, userId, logger) {
    await rateLimiter.waitForSlot();
    try {
        const response = await axios.get(`https://discord.com/api/v9/users/@me/channels`, {
            headers: {
                'Authorization': authToken,
                'Content-Type': 'application/json'
            }
        });
        
        return true;
    } catch (error) {
        if (error.response && error.response.status === 404) {
            if (logger) logger(`User ${userId} not found, skipping`, 'info');
            return false;
        }
        if (error.response && error.response.status === 400) {
            if (logger) logger(`Invalid user ID ${userId}, skipping`, 'info');
            return false;
        }
        if (error.response && error.response.status === 403) {
            if (logger) logger(`403 Status on user ID ${userId}, skipping. Likely a deleted user.`, 'info');
            return false;
        }
        throw error;
    }
}

async function reopenDM(authToken, userId, logger) {
    await rateLimiter.waitForSlot();
    
    if (configManager.get('DRY_RUN')) {
        if (logger) logger(`[DRY RUN] Would reopen DM with user ${userId}`, 'info');
        return { id: 'dry-run-id' };
    }

    // Validate user before attempting to reopen DM
    const isValid = await validateUser(authToken, userId, logger);
    if (!isValid) {
        return null;
    }
    
    return withRetry(async () => {
        const response = await axios.post('https://discord.com/api/v9/users/@me/channels', 
            { recipients: [userId] }, 
            {
                headers: {
                    'Authorization': authToken,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data;
    }, `Reopening DM with user ${userId}`, logger);
}

async function closeDM(authToken, channelId, logger) {
    await rateLimiter.waitForSlot();
    if (configManager.get('DRY_RUN')) {
        if (logger) logger(`[DRY RUN] Would close DM channel ${channelId}`, 'info');
        return;
    }
    
    return withRetry(async () => {
        const response = await axios.delete(`https://discord.com/api/v9/channels/${channelId}`, {
            headers: {
                'Authorization': authToken,
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    }, `Closing DM channel ${channelId}`, logger);
}

module.exports = {
    getCurrentOpenDMs,
    validateUser,
    reopenDM,
    closeDM,
    delay
};

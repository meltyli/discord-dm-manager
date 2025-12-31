const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { getConfigManager } = require('./config');
const { RateLimiter, delay } = require('./lib/rate-limiter');
const { isDryRun } = require('./lib/dry-run-helper');

const configManager = getConfigManager();

async function withRetry(operation, description) {
    for (let attempt = 1; attempt <= configManager.get('MAX_RETRIES'); attempt++) {
        try {
            return await operation();
        } catch (error) {
            if (attempt === configManager.get('MAX_RETRIES')) {
                throw error;
            }
            
            let delayMs = configManager.get('RETRY_DELAY_MS');
            if (error.response && error.response.status === 429) {
                const retryAfter = error.response.headers['retry-after'];
                delayMs = retryAfter ? parseInt(retryAfter) * 1000 : 10000;
                console.warn(`${description} rate limited, waiting ${delayMs}ms before retry ${attempt}/${configManager.get('MAX_RETRIES')}`);
            } else {
                console.warn(`${description} failed, attempt ${attempt}/${configManager.get('MAX_RETRIES')}: ${error.message}`);
            }
            
            await delay(delayMs);
        }
    }
}

const rateLimiter = new RateLimiter(configManager.get('RATE_LIMIT_REQUESTS'), configManager.get('RATE_LIMIT_INTERVAL_MS'));

async function getCurrentOpenDMs(authToken) {
    if (isDryRun()) {
        console.log('[DRY RUN] Would fetch current open DMs');
        return [];
    }
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

async function validateUser(authToken, userId) {
    if (isDryRun()) {
        console.log(`[DRY RUN] Would validate user ${userId}`);
        return true;
    }

    await rateLimiter.waitForSlot();
    try {
        await axios.post('https://discord.com/api/v9/users/@me/channels', 
            { recipients: [userId] },
            {
                headers: {
                    'Authorization': authToken,
                    'Content-Type': 'application/json'
                }
            }
        );
        return true;
    } catch (error) {
        if (error.response) {
            const status = error.response.status;
            if (status === 404) {
                console.log(`User ${userId} not found, skipping`);
                return false;
            }
            if (status === 400) {
                console.log(`Invalid user ID ${userId}, skipping`);
                return false;
            }
            if (status === 403) {
                console.log(`User ${userId} access forbidden (likely deleted), skipping`);
                return false;
            }
        }
        throw error;
    }
}

async function reopenDM(authToken, userId) {
    if (isDryRun()) {
        console.log(`[DRY RUN] Would reopen DM with user ${userId}`);
        return { id: 'dry-run-id' };
    }

    const isValid = await validateUser(authToken, userId);
    if (!isValid) {
        return null;
    }
    
    try {
        return await withRetry(async () => {
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
        }, `Reopening DM with user ${userId}`);
    } catch (error) {
        if (error.response && [400, 403, 404].includes(error.response.status)) {
            console.log(`Failed to reopen DM with user ${userId}: ${error.message}`);
            return null;
        }
        throw error;
    }
}

async function closeDM(authToken, channelId) {
    if (isDryRun()) {
        console.log(`[DRY RUN] Would close DM channel ${channelId}`);
        return;
    }
    
    await rateLimiter.waitForSlot();
    
    return withRetry(async () => {
        const response = await axios.delete(`https://discord.com/api/v9/channels/${channelId}`, {
            headers: {
                'Authorization': authToken,
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    }, `Closing DM channel ${channelId}`);
}

module.exports = {
    getCurrentOpenDMs,
    validateUser,
    reopenDM,
    closeDM,
    delay
};

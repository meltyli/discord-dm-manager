const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { getConfigManager } = require('./config');
const { RateLimiter, delay } = require('./lib/rate-limiter');
const { isDryRun } = require('./lib/dry-run-helper');
const { clearProgressLine } = require('./lib/cli-helpers');

const configManager = getConfigManager();

// Constants
const DEFAULT_RATE_LIMIT_RETRY_MS = 10000; // 10 seconds if no retry-after header

async function withRetry(operation, description) {
    for (let attempt = 1; attempt <= configManager.get('MAX_RETRIES'); attempt++) {
        try {
                return await operation();
            } catch (error) {
                let delayMs = configManager.get('RETRY_DELAY_MS');
                let msg;
                if (error.response && error.response.status === 429) {
                    const retryAfter = error.response.headers['retry-after'];
                    delayMs = retryAfter ? parseInt(retryAfter) * 1000 : DEFAULT_RATE_LIMIT_RETRY_MS;
                    msg = `${description} rate limited! waiting ${delayMs}ms before retry ${attempt}/${configManager.get('MAX_RETRIES')}`;
                } else {
                    msg = `${description} failed! attempt ${attempt}/${configManager.get('MAX_RETRIES')}: ${error.message}`;
                }
                console.warn(msg);

                if (attempt === configManager.get('MAX_RETRIES')) {
                    throw error;
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
    
    return await withRetry(async () => {
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
    }, `Validating user ${userId}`);
}

async function reopenDM(authToken, userId, progressBar = null) {
    if (isDryRun()) {
        console.log(`[DRY RUN] Would reopen DM with user ${userId}`);
        return { id: 'dry-run-id' };
    }
    
    return await withRetry(async () => {
        try {
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
        } catch (error) {
            if (error.response) {
                const status = error.response.status;
                // Handle expected error cases that shouldn't be retried
                const handleSkip = (message) => {
                    if (progressBar) clearProgressLine();
                    console.log(message);
                    return null;
                };
                
                if (status === 404) return handleSkip(`User ${userId} not found, skipping`);
                if (status === 400) return handleSkip(`Invalid user ID ${userId}, skipping`);
                if (status === 403) return handleSkip(`User ${userId} access forbidden (likely deleted), skipping`);
            }
            // Throw other errors (401, 429, 5xx) to trigger retry
            throw error;
        }
    }, `Reopening DM with user ${userId}`);
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

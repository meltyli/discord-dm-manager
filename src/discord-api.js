const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { getConfigManager } = require('./config');
const { RateLimiter, delay } = require('./lib/rate-limiter');
const { isDryRun } = require('./lib/dry-run-helper');

const configManager = getConfigManager();

/**
 * Retries an operation with exponential backoff
 * @param {Function} operation - Async function to retry
 * @param {string} description - Description for logging
 * @returns {Promise<any>} Result of operation
 * @throws {Error} If all retries fail
 */
async function withRetry(operation, description) {
    for (let attempt = 1; attempt <= configManager.get('MAX_RETRIES'); attempt++) {
        try {
            return await operation();
        } catch (error) {
            if (attempt === configManager.get('MAX_RETRIES')) {
                throw error;
            }
            
            // Handle 429 rate limit with longer delay
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

// Discord API functions with rate limiting
const rateLimiter = new RateLimiter(configManager.get('RATE_LIMIT_REQUESTS'), configManager.get('RATE_LIMIT_INTERVAL_MS'));

/**
 * Fetches currently open DM channels
 * @param {string} authToken - Discord authorization token
 * @returns {Promise<Array>} Array of open DM channel objects
 */
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

/**
 * Validates if a Discord user exists and is accessible by attempting to open DM
 * @param {string} authToken - Discord authorization token
 * @param {string} userId - Discord user ID to validate
 * @returns {Promise<boolean>} True if valid, false if not found/deleted/invalid
 */
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

/**
 * Opens a DM with specified user (validates user first, respects DRY_RUN mode)
 * @param {string} authToken - Discord authorization token
 * @param {string} userId - Discord user ID to open DM with
 * @returns {Promise<Object|null>} Channel object or null if user invalid
 */
async function reopenDM(authToken, userId) {
    if (isDryRun()) {
        console.log(`[DRY RUN] Would reopen DM with user ${userId}`);
        return { id: 'dry-run-id' };
    }

    // Validate user before attempting to reopen DM
    const isValid = await validateUser(authToken, userId);
    if (!isValid) {
        return null;
    }
    
    // User already validated, so this call should succeed
    // But still use retry logic in case of network issues
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
        // If we still get 400/403/404 after validation, treat as skipped user
        if (error.response && [400, 403, 404].includes(error.response.status)) {
            console.log(`Failed to reopen DM with user ${userId}: ${error.message}`);
            return null;
        }
        throw error;
    }
}

/**
 * Closes a DM channel (respects DRY_RUN mode)
 * @param {string} authToken - Discord authorization token
 * @param {string} channelId - Discord channel ID to close
 * @returns {Promise<void>}
 */
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

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { getConfigManager } = require('./config');
const { RateLimiter, delay } = require('./lib/rate-limiter');
const configManager = getConfigManager();

/**
 * Retries an operation with exponential backoff
 * @param {Function} operation - Async function to retry
 * @param {string} description - Description for logging
 * @param {Function} [logger] - Optional logger function
 * @returns {Promise<any>} Result of operation
 * @throws {Error} If all retries fail
 */
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

/**
 * Fetches currently open DM channels
 * @param {string} authToken - Discord authorization token
 * @param {Function} [logger] - Optional logger function
 * @returns {Promise<Array>} Array of open DM channel objects
 */
async function getCurrentOpenDMs(authToken, logger) {
    // In DRY_RUN mode, return mock data instead of making API call
    if (configManager.get('DRY_RUN')) {
        if (logger) logger('[DRY RUN] Skipping API call to fetch open DMs', 'info');
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
    }, 'Fetching current open DMs', logger);
}

/**
 * Validates if a Discord user exists and is accessible by attempting to open DM
 * @param {string} authToken - Discord authorization token
 * @param {string} userId - Discord user ID to validate
 * @param {Function} [logger] - Optional logger function
 * @returns {Promise<boolean>} True if valid, false if not found/deleted/invalid
 */
async function validateUser(authToken, userId, logger) {
    await rateLimiter.waitForSlot();
    try {
        // Use GET to the user endpoint to validate existence/access. Tests mock axios.get.
        await axios.get(`https://discord.com/api/v9/users/${userId}`, {
            headers: {
                'Authorization': authToken,
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        if (error.response) {
            const status = error.response.status;
            if (status === 404) {
                if (logger) logger(`User ${userId} not found, skipping`, 'debug');
                return false;
            }
            if (status === 400) {
                if (logger) logger(`Invalid user ID ${userId}, skipping`, 'debug');
                return false;
            }
            if (status === 403) {
                if (logger) logger(`User ${userId} access forbidden (likely deleted), skipping`, 'debug');
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
 * @param {Function} [logger] - Optional logger function
 * @returns {Promise<Object|null>} Channel object or null if user invalid
 */
async function reopenDM(authToken, userId, logger) {
    // In DRY_RUN mode, skip rate limiting and API calls entirely
    if (configManager.get('DRY_RUN')) {
        if (logger) logger(`[DRY RUN] Would reopen DM with user ${userId}`, 'info');
        return { id: 'dry-run-id' };
    }

    // Validate user before attempting to reopen DM
    const isValid = await validateUser(authToken, userId, logger);
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
        }, `Reopening DM with user ${userId}`, logger);
    } catch (error) {
        // If we still get 400/403/404 after validation, treat as skipped user
        if (error.response && [400, 403, 404].includes(error.response.status)) {
            if (logger) logger(`Failed to reopen DM with user ${userId}: ${error.message}`, 'debug');
            return null;
        }
        throw error;
    }
}

/**
 * Closes a DM channel (respects DRY_RUN mode)
 * @param {string} authToken - Discord authorization token
 * @param {string} channelId - Discord channel ID to close
 * @param {Function} [logger] - Optional logger function
 * @returns {Promise<void>}
 */
async function closeDM(authToken, channelId, logger) {
    // In DRY_RUN mode, skip rate limiting and API calls entirely
    if (configManager.get('DRY_RUN')) {
        if (logger) logger(`[DRY RUN] Would close DM channel ${channelId}`, 'info');
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
    }, `Closing DM channel ${channelId}`, logger);
}

module.exports = {
    getCurrentOpenDMs,
    validateUser,
    reopenDM,
    closeDM,
    delay
};

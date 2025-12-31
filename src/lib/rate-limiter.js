/**
 * Delays execution for a specified time
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generates a random integer between min and max (inclusive)
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number}
 */
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Track when the next long pause should occur
let nextLongPauseAt = randomInt(40, 50);

/**
 * Resets the long pause schedule (useful when starting a new batch of operations)
 */
function resetRandomDelaySchedule() {
    nextLongPauseAt = randomInt(40, 50);
}

/**
 * Delays execution for a random time with periodic longer pauses
 * @param {number} callCount - Current API call count
 * @param {number} totalCalls - Total expected API calls (optional, if > 50 enables long pauses)
 * @returns {Promise<void>}
 */
async function randomDelay(callCount, totalCalls = 0) {
    // Only do long pauses if total calls > 50
    const shouldDoLongPauses = totalCalls > 50;
    
    // Check if it's time for a longer pause
    if (shouldDoLongPauses && callCount >= nextLongPauseAt) {
        // Long pause: 5-20 seconds
        const longPauseMs = randomInt(5000, 20000);
        console.log(`\nTaking a ${(longPauseMs / 1000).toFixed(1)}s pause after ${callCount} API calls...`);
        await delay(longPauseMs);
        
        // Schedule next long pause in 40-50 calls
        nextLongPauseAt = callCount + randomInt(40, 50);
    } else {
        // Regular pause: 0-2 seconds
        const regularPauseMs = randomInt(0, 2000);
        
        // Log if > 4 seconds
        if (regularPauseMs > 4000) {
            console.log(`Pausing for ${(regularPauseMs / 1000).toFixed(1)}s...`);
        }
        
        await delay(regularPauseMs);
    }
}

/**
 * Rate limiter for API requests
 */
class RateLimiter {
    /**
     * @param {number} maxRequests - Maximum requests allowed in interval
     * @param {number} interval - Time interval in milliseconds
     */
    constructor(maxRequests, interval) {
        this.maxRequests = maxRequests;
        this.interval = interval;
        this.requests = [];
    }

    /**
     * Waits for available rate limit slot before proceeding
     * @returns {Promise<void>}
     */
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

module.exports = { RateLimiter, delay, randomDelay, randomInt, resetRandomDelaySchedule };

// Constants
const LONG_PAUSE_MIN_MS = 5000;
const LONG_PAUSE_MAX_MS = 20000;
const LONG_PAUSE_INTERVAL_MIN = 40;
const LONG_PAUSE_INTERVAL_MAX = 50;
const LONG_PAUSE_THRESHOLD = 50;
const REGULAR_PAUSE_MIN_MS = 0;
const REGULAR_PAUSE_MAX_MS = 2000;
const LOG_PAUSE_THRESHOLD_MS = 4000;

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

let nextLongPauseAt = randomInt(LONG_PAUSE_INTERVAL_MIN, LONG_PAUSE_INTERVAL_MAX);

function resetRandomDelaySchedule() {
    nextLongPauseAt = randomInt(LONG_PAUSE_INTERVAL_MIN, LONG_PAUSE_INTERVAL_MAX);
}

async function randomDelay(callCount, totalCalls = 0) {
    const shouldDoLongPauses = totalCalls > LONG_PAUSE_THRESHOLD;
    
    if (shouldDoLongPauses && callCount >= nextLongPauseAt) {
        const longPauseMs = randomInt(LONG_PAUSE_MIN_MS, LONG_PAUSE_MAX_MS);
        console.log(`\nTaking a ${(longPauseMs / 1000).toFixed(1)}s pause after ${callCount} API calls.`);
        await delay(longPauseMs);
        
        nextLongPauseAt = callCount + randomInt(LONG_PAUSE_INTERVAL_MIN, LONG_PAUSE_INTERVAL_MAX);
    } else {
        const regularPauseMs = randomInt(REGULAR_PAUSE_MIN_MS, REGULAR_PAUSE_MAX_MS);
        
        // Log if > 4 seconds
        if (regularPauseMs > LOG_PAUSE_THRESHOLD_MS) {
            console.log(`Pausing for ${(regularPauseMs / 1000).toFixed(1)}s.`);
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

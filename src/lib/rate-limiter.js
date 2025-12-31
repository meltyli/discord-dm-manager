function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

let nextLongPauseAt = randomInt(40, 50);

function resetRandomDelaySchedule() {
    nextLongPauseAt = randomInt(40, 50);
}

async function randomDelay(callCount, totalCalls = 0) {
    const shouldDoLongPauses = totalCalls > 50;
    
    if (shouldDoLongPauses && callCount >= nextLongPauseAt) {
        const longPauseMs = randomInt(5000, 20000);
        console.log(`\nTaking a ${(longPauseMs / 1000).toFixed(1)}s pause after ${callCount} API calls...`);
        await delay(longPauseMs);
        
        nextLongPauseAt = callCount + randomInt(40, 50);
    } else {
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

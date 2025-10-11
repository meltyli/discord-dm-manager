/**
 * Delays execution for a specified time
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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

module.exports = { RateLimiter, delay };

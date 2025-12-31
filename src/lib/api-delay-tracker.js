const { randomDelay } = require('./rate-limiter');

/**
 * Tracks API calls and applies random delays to avoid rate limiting
 */
class ApiDelayTracker {
    constructor() {
        this.apiCallCount = 0;
        this.totalApiCalls = 0;
    }

    /**
     * Resets the API call counter
     * @param {number} totalCalls - Total number of calls expected in this operation
     */
    reset(totalCalls = 0) {
        this.apiCallCount = 0;
        this.totalApiCalls = totalCalls;
    }

    /**
     * Increments counter and applies random delay
     * @returns {Promise<void>}
     */
    async trackAndDelay() {
        this.apiCallCount++;
        await randomDelay(this.apiCallCount, this.totalApiCalls);
    }

    /**
     * Gets current call count
     * @returns {number}
     */
    getCount() {
        return this.apiCallCount;
    }
}

// Singleton instance for shared tracking across batch operations
let sharedTracker = null;

/**
 * Gets or creates the shared API delay tracker instance
 * @returns {ApiDelayTracker}
 */
function getApiDelayTracker() {
    if (!sharedTracker) {
        sharedTracker = new ApiDelayTracker();
    }
    return sharedTracker;
}

/**
 * Creates a new independent API delay tracker
 * @returns {ApiDelayTracker}
 */
function createApiDelayTracker() {
    return new ApiDelayTracker();
}

module.exports = {
    ApiDelayTracker,
    getApiDelayTracker,
    createApiDelayTracker
};

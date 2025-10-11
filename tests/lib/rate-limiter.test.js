const { RateLimiter, delay } = require('../../src/lib/rate-limiter');

describe('RateLimiter', () => {
    test('should allow requests within limit', async () => {
        const limiter = new RateLimiter(2, 1000);
        await limiter.waitForSlot();
        await limiter.waitForSlot();
        expect(limiter.requests.length).toBe(2);
    });

    test('should delay when rate limit exceeded', async () => {
        const limiter = new RateLimiter(2, 1000);
        await limiter.waitForSlot();
        await limiter.waitForSlot();
        
        const startTime = Date.now();
        await limiter.waitForSlot();
        const elapsed = Date.now() - startTime;
        
        // Should wait at least 900ms (allowing some margin)
        expect(elapsed).toBeGreaterThan(900);
    });

    test('should clean up old requests', async () => {
        const limiter = new RateLimiter(2, 500);
        await limiter.waitForSlot();
        await limiter.waitForSlot();
        
        // Wait for interval to pass
        await delay(600);
        
        // Should allow new requests without waiting
        await limiter.waitForSlot();
        expect(limiter.requests.length).toBe(1);
    });
});

describe('delay', () => {
    test('should delay for specified time', async () => {
        const startTime = Date.now();
        await delay(100);
        const elapsed = Date.now() - startTime;
        
        expect(elapsed).toBeGreaterThanOrEqual(90);
        expect(elapsed).toBeLessThan(150);
    });
});

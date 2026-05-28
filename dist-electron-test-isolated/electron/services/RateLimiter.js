"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimiter = void 0;
exports.createProviderRateLimiters = createProviderRateLimiters;
/**
 * RateLimiter - Token bucket rate limiter for LLM API calls
 * Prevents 429 errors on free-tier API plans by queuing requests
 * when the bucket is empty.
 *
 * BUG-4 fixes:
 *   1. MAX_QUEUE_DEPTH cap — prevents unbounded memory growth under sustained load
 *      (e.g. fast-text mode at 1 req/s with a 6 req/min limit → 54 waiters in 60s).
 *   2. destroy() now rejects waiters instead of resolving them — the old behaviour
 *      called resolve() with no token, silently bypassing the rate limit on shutdown.
 */
class RateLimiter {
    tokens;
    maxTokens;
    refillRatePerSecond;
    lastRefillTime;
    waitQueue = [];
    refillTimer = null;
    // Hard cap on pending waiters — beyond this depth, new callers get an immediate
    // rejection instead of queuing. Prevents memory explosion during rate-limit storms.
    // 20 queued requests = ~33s of wait at 6 req/min (Groq free tier) before the first
    // queued request even starts — anything beyond that is an abuse pattern.
    MAX_QUEUE_DEPTH = 20;
    /**
     * @param maxTokens - Maximum burst capacity (e.g. 30 for Groq free tier)
     * @param refillRatePerSecond - Tokens added per second (e.g. 0.5 = 30/min)
     */
    constructor(maxTokens, refillRatePerSecond) {
        this.maxTokens = maxTokens;
        this.tokens = maxTokens;
        this.refillRatePerSecond = refillRatePerSecond;
        this.lastRefillTime = Date.now();
        // Refill tokens periodically. unref() so the timer does not keep the
        // event loop alive — important for unit tests that create a limiter
        // without explicitly destroy()ing it (otherwise `node --test` hangs
        // forever waiting for the interval to drain).
        this.refillTimer = setInterval(() => this.refill(), 1000);
        if (this.refillTimer && typeof this.refillTimer.unref === 'function') {
            this.refillTimer.unref();
        }
    }
    /**
     * Acquire a token. Resolves immediately if available.
     * If the bucket is empty, waits up to MAX_QUEUE_DEPTH slots.
     * Throws RateLimitQueueFullError if the queue is full — callers should catch and fail-fast.
     */
    async acquire() {
        this.refill();
        if (this.tokens >= 1) {
            this.tokens -= 1;
            return;
        }
        if (this.waitQueue.length >= this.MAX_QUEUE_DEPTH) {
            throw new Error(`Rate limiter queue full (${this.MAX_QUEUE_DEPTH} waiters) — request rejected to prevent memory overflow`);
        }
        // Wait for a token to become available
        return new Promise((resolve, reject) => {
            this.waitQueue.push({ resolve, reject });
        });
    }
    refill() {
        const now = Date.now();
        const elapsed = (now - this.lastRefillTime) / 1000;
        const newTokens = elapsed * this.refillRatePerSecond;
        if (newTokens >= 1) {
            this.tokens = Math.min(this.maxTokens, this.tokens + Math.floor(newTokens));
            this.lastRefillTime = now;
            // Wake up waiting requests
            while (this.waitQueue.length > 0 && this.tokens >= 1) {
                this.tokens -= 1;
                const waiter = this.waitQueue.shift();
                waiter.resolve();
            }
        }
    }
    destroy() {
        if (this.refillTimer) {
            clearInterval(this.refillTimer);
            this.refillTimer = null;
        }
        // BUG-4 fix: reject (not resolve) all queued waiters on destroy.
        // Previously called resolve() which let callers proceed without a token —
        // silently bypassing the rate limit on app shutdown.
        while (this.waitQueue.length > 0) {
            const waiter = this.waitQueue.shift();
            waiter.reject(new Error('RateLimiter destroyed — request cancelled'));
        }
    }
}
exports.RateLimiter = RateLimiter;
/**
 * Pre-configured rate limiters for known providers.
 * These match documented free-tier limits.
 */
function createProviderRateLimiters() {
    return {
        groq: new RateLimiter(6, 0.1), // 6 req/min
        gemini: new RateLimiter(120, 2.0), // 120 req/min
        openai: new RateLimiter(120, 2.0), // 120 req/min
        claude: new RateLimiter(120, 2.0), // 120 req/min
    };
}
//# sourceMappingURL=RateLimiter.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiPromptCache = void 0;
const crypto_1 = __importDefault(require("crypto"));
/**
 * Minimum prompt size to attempt caching, in characters.
 *
 * Gemini explicit caching has a per-model minimum input token count:
 *   - gemini-2.0+ / 3.x: 1024 tokens
 *   - gemini-1.5: 32,768 tokens
 *
 * The codebase uses gemini-3.1 models exclusively; the 1024-token floor
 * applies. 4096 chars is a conservative proxy (≈1024 tokens at 4 chars/tok);
 * a tighter bound rejects prompts that would be borderline. Bumping to 4500
 * leaves a safety margin so we don't waste an API round-trip on
 * INVALID_ARGUMENT.
 */
const MIN_PROMPT_CHARS = 4500;
/** Server-side TTL we request. 1 hour matches Gemini's default. */
const CACHE_TTL_SECONDS = 3600;
/** When < this many ms remain on a cache, treat it as expired and recreate. */
const RENEWAL_WINDOW_MS = 5 * 60 * 1000;
class GeminiPromptCache {
    entries = new Map();
    /** In-flight creation promises keyed by hash — for dedupe under concurrency. */
    inflight = new Map();
    /**
     * Return the cache resource name for (model, systemPrompt), creating it if
     * absent or near-expired. Returns null when caching is not viable —
     * callers must fall back to passing `systemInstruction` directly.
     */
    async getOrCreate(client, model, systemPrompt) {
        if (!systemPrompt || systemPrompt.length < MIN_PROMPT_CHARS)
            return null;
        const key = this.hashKey(model, systemPrompt);
        const now = Date.now();
        const existing = this.entries.get(key);
        if (existing) {
            // Sentinel from a previous failure — still in cooldown, skip retry.
            if (!existing.name && existing.expiresAt > now)
                return null;
            // Live cache, still far enough from expiry.
            if (existing.name && existing.expiresAt - now > RENEWAL_WINDOW_MS) {
                return existing.name;
            }
        }
        // Dedupe concurrent creates for the same key.
        const pending = this.inflight.get(key);
        if (pending)
            return pending;
        const creation = this.create(client, model, systemPrompt, key).finally(() => {
            this.inflight.delete(key);
        });
        this.inflight.set(key, creation);
        return creation;
    }
    /**
     * Drop a stale entry when the server reports the cache no longer exists
     * (e.g. expired between our last use and now). Safe to call with any name.
     */
    invalidate(name) {
        for (const [k, v] of this.entries) {
            if (v.name === name) {
                this.entries.delete(k);
                return;
            }
        }
    }
    /** For diagnostics. */
    size() {
        return this.entries.size;
    }
    async create(client, model, systemPrompt, key) {
        try {
            // Gemini requires both `contents` AND `systemInstruction` to have non-empty
            // bodies. We use a one-token placeholder for contents so the entire prompt
            // sits in `systemInstruction` (which is what we want to cache).
            const response = await client.caches.create({
                model,
                config: {
                    contents: [{ role: 'user', parts: [{ text: '_' }] }],
                    systemInstruction: { parts: [{ text: systemPrompt }] },
                    ttl: `${CACHE_TTL_SECONDS}s`,
                    displayName: `natively-sys-${key.slice(0, 8)}`,
                },
            });
            const name = response?.name;
            if (!name) {
                console.warn('[GeminiPromptCache] caches.create returned no name; skipping cache');
                return null;
            }
            this.entries.set(key, {
                name,
                expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000,
            });
            console.log(`[GeminiPromptCache] created ${name} for model=${model} (${systemPrompt.length} chars)`);
            return name;
        }
        catch (err) {
            // Non-fatal. Common reasons: prompt below model minimum, model doesn't
            // support caching, transient 5xx. We log once and fall back to
            // systemInstruction on every subsequent call for this key until the
            // process restarts — there's no value in retrying create on every turn
            // when the underlying constraint is structural.
            console.warn(`[GeminiPromptCache] caches.create failed for model=${model}: ${err?.message || err}. ` +
                `Falling back to systemInstruction.`);
            // Mark as failed for a short cooldown by stashing a sentinel entry.
            this.entries.set(key, {
                name: '',
                expiresAt: Date.now() + 5 * 60 * 1000, // 5min cooldown before retrying create
            });
            return null;
        }
    }
    hashKey(model, systemPrompt) {
        return crypto_1.default.createHash('sha1').update(model).update('\0').update(systemPrompt).digest('hex');
    }
}
exports.GeminiPromptCache = GeminiPromptCache;
//# sourceMappingURL=GeminiPromptCache.js.map
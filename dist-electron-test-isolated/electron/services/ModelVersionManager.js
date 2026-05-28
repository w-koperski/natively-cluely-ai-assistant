"use strict";
/**
 * ModelVersionManager — Self-Improving Model Rotation (v3)
 *
 * Three-tier retry system for BOTH vision (screenshot analysis) and text
 * (chat fallback chains) that auto-discovers newer models and promotes
 * them through tiers:
 *
 *   Tier 1 (Primary):      Pinned stable models. Promoted only when 2+ minor
 *                           versions behind OR previous stable on major jump.
 *   Tier 2 (Fallback):     Auto-discovered latest models from each provider.
 *   Tier 3 (Retry):        Same as Tier 2. Pure retry pass with backoff.
 *
 * Vision and Text use SEPARATE family sets with distinct baselines, since
 * the same provider may use different models for each (e.g., Groq uses
 * llama-4-scout for vision but llama-3.3-70b for text).
 *
 * Background discovery runs every ~14 days. Event-driven discovery can be
 * triggered on 404/model-not-found errors.
 *
 * State is persisted to disk with rollback support.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelVersionManager = exports.TEXT_PROVIDER_ORDER = exports.VISION_PROVIDER_ORDER = exports.TextModelFamily = exports.ModelFamily = void 0;
exports.parseModelVersion = parseModelVersion;
exports.compareVersions = compareVersions;
exports.versionDistance = versionDistance;
exports.classifyModel = classifyModel;
exports.classifyTextModel = classifyTextModel;
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
var ModelFamily;
(function (ModelFamily) {
    ModelFamily["OPENAI"] = "openai";
    ModelFamily["GEMINI_FLASH"] = "gemini_flash";
    ModelFamily["GEMINI_PRO"] = "gemini_pro";
    ModelFamily["CLAUDE"] = "claude";
    ModelFamily["GROQ_LLAMA"] = "groq_llama";
})(ModelFamily || (exports.ModelFamily = ModelFamily = {}));
/** Text model families — separate from vision since providers use different models */
var TextModelFamily;
(function (TextModelFamily) {
    TextModelFamily["OPENAI"] = "text_openai";
    TextModelFamily["GEMINI_FLASH"] = "text_gemini_flash";
    TextModelFamily["GEMINI_PRO"] = "text_gemini_pro";
    TextModelFamily["CLAUDE"] = "text_claude";
    TextModelFamily["GROQ"] = "text_groq";
})(TextModelFamily || (exports.TextModelFamily = TextModelFamily = {}));
// ─── Constants ──────────────────────────────────────────────────────────
/** Hardcoded baseline models for vision Tier 1 (initial pinned stable) */
const BASELINE_MODELS = {
    [ModelFamily.OPENAI]: 'gpt-5.4',
    [ModelFamily.GEMINI_FLASH]: 'gemini-3.1-flash-lite-preview',
    [ModelFamily.GEMINI_PRO]: 'gemini-3.1-pro-preview',
    [ModelFamily.CLAUDE]: 'claude-sonnet-4-6',
    [ModelFamily.GROQ_LLAMA]: 'meta-llama/llama-4-scout-17b-16e-instruct',
};
/** Hardcoded baseline models for text Tier 1 */
const TEXT_BASELINE_MODELS = {
    [TextModelFamily.OPENAI]: 'gpt-5.4',
    [TextModelFamily.GEMINI_FLASH]: 'gemini-3.1-flash-lite-preview',
    [TextModelFamily.GEMINI_PRO]: 'gemini-3.1-pro-preview',
    [TextModelFamily.CLAUDE]: 'claude-sonnet-4-6',
    [TextModelFamily.GROQ]: 'llama-3.3-70b-versatile',
};
/** Vision-capable model ordering for screenshot analysis */
exports.VISION_PROVIDER_ORDER = [
    ModelFamily.OPENAI,
    ModelFamily.GEMINI_FLASH,
    ModelFamily.CLAUDE,
    ModelFamily.GEMINI_PRO,
    ModelFamily.GROQ_LLAMA,
];
/** Text model ordering for chat fallback chains */
exports.TEXT_PROVIDER_ORDER = [
    TextModelFamily.GROQ,
    TextModelFamily.OPENAI,
    TextModelFamily.CLAUDE,
    TextModelFamily.GEMINI_FLASH,
    TextModelFamily.GEMINI_PRO,
];
const SCHEMA_VERSION = 4;
const DISCOVERY_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const PERSISTENCE_FILENAME = 'model_versions.json';
const MAX_DISCOVERY_FAILURES_BEFORE_BACKOFF = 3;
const DISCOVERY_BACKOFF_MULTIPLIER = 2; // exponential backoff on repeated failures
/** Cooldown to prevent event-driven discovery from firing too often */
const EVENT_DISCOVERY_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
// ─── Version Parsing ────────────────────────────────────────────────────
/**
 * Extract a semantic version from a model identifier string.
 *
 * Handles diverse and irregular naming conventions:
 *   "gpt-5.4"                                  → { major:5, minor:4, patch:0 }
 *   "gpt-5.4"                                  → { major:5, minor:4, patch:0 }
 *   "gemini-3.1-flash-lite-preview"            → { major:3, minor:1, patch:0 }
 *   "gemini-3.1-pro-preview"                   → { major:3, minor:1, patch:0 }
 *   "claude-sonnet-4-6"                        → { major:4, minor:6, patch:0 }
 *   "claude-opus-4-6"                          → { major:4, minor:6, patch:0 }
 *   "meta-llama/llama-4-scout-17b-16e-instruct"→ { major:4, minor:0, patch:0 }
 *   "llama-4-scout-17b-16e-instruct"           → { major:4, minor:0, patch:0 }
 *
 * NOTE: Hardware specifiers (17b, 16e) and tags (preview, latest, instruct)
 * are intentionally stripped before parsing. They are NOT version indicators.
 */
function parseModelVersion(modelId) {
    // Normalize: strip vendor prefixes and non-version suffixes
    let cleaned = modelId
        .replace(/^meta-llama\//, '') // vendor prefix
        .replace(/-chat-latest$/, '') // OpenAI suffix
        .replace(/-lite-preview$/, '') // Gemini suffix
        .replace(/-preview$/, '') // Gemini suffix
        .replace(/-latest$/, '') // generic suffix
        .replace(/-instruct$/, '') // instruction-tuned tag
        .replace(/-\d+b(-\d+e)?$/, '') // hardware specs like -17b-16e
        .replace(/-\d+b$/, ''); // hardware specs like -70b
    // Strategy 1: Dotted version (X.Y or X.Y.Z) — most OpenAI & Gemini models
    const dotVersion = cleaned.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
    if (dotVersion) {
        return {
            major: parseInt(dotVersion[1], 10),
            minor: parseInt(dotVersion[2], 10),
            patch: dotVersion[3] ? parseInt(dotVersion[3], 10) : 0,
            raw: modelId,
        };
    }
    // Strategy 2: Claude-style hyphenated version (claude-TYPE-MAJOR-MINOR)
    //   "claude-sonnet-4-6" → major:4, minor:6
    //   "claude-opus-5-2"   → major:5, minor:2
    const claudePattern = cleaned.match(/claude-(?:sonnet|opus|haiku)-(\d+)-(\d+)/);
    if (claudePattern) {
        return {
            major: parseInt(claudePattern[1], 10),
            minor: parseInt(claudePattern[2], 10),
            patch: 0,
            raw: modelId,
        };
    }
    // Strategy 3: Llama-style (llama-MAJOR-TYPE) — no minor version
    //   "llama-4-scout" → major:4, minor:0
    const llamaPattern = cleaned.match(/llama-(\d+)-/);
    if (llamaPattern) {
        return {
            major: parseInt(llamaPattern[1], 10),
            minor: 0,
            patch: 0,
            raw: modelId,
        };
    }
    // Strategy 4: Generic trailing hyphenated version (word-MAJOR-MINOR)
    const trailingVersion = cleaned.match(/(\d+)-(\d+)$/);
    if (trailingVersion) {
        return {
            major: parseInt(trailingVersion[1], 10),
            minor: parseInt(trailingVersion[2], 10),
            patch: 0,
            raw: modelId,
        };
    }
    // Strategy 5: Single version number after a word boundary
    const singleVersion = cleaned.match(/[a-z]-(\d+)(?:$|-[a-z])/i);
    if (singleVersion) {
        return {
            major: parseInt(singleVersion[1], 10),
            minor: 0,
            patch: 0,
            raw: modelId,
        };
    }
    console.warn(`[ModelVersionManager] ⚠️ Could not parse version from model ID: "${modelId}"`);
    return null;
}
/**
 * Compare two ModelVersions.
 * Returns: negative if a < b, 0 if equal, positive if a > b
 */
function compareVersions(a, b) {
    if (a.major !== b.major)
        return a.major - b.major;
    if (a.minor !== b.minor)
        return a.minor - b.minor;
    return a.patch - b.patch;
}
/**
 * Calculate the "distance" between two versions in minor-version units.
 * Used to determine if tier promotion thresholds are reached.
 * A major version bump counts as 10 minor versions (always triggers promotion).
 */
function versionDistance(older, newer) {
    if (newer.major > older.major) {
        return (newer.major - older.major) * 10 + (newer.minor - older.minor);
    }
    return (newer.minor - older.minor) + (newer.patch - older.patch) * 0.1;
}
// ─── Model Family Classification ────────────────────────────────────────
/**
 * Determine which vision ModelFamily a discovered model ID belongs to.
 * Returns null if it doesn't match any known vision-capable family.
 */
function classifyModel(modelId) {
    const lower = modelId.toLowerCase();
    // OpenAI GPT vision models (exclude instruct-only variants)
    if (lower.startsWith('gpt-') && !lower.includes('instruct')) {
        return ModelFamily.OPENAI;
    }
    // Gemini Flash variants
    if (lower.includes('gemini') && (lower.includes('flash') || lower.includes('lite'))) {
        return ModelFamily.GEMINI_FLASH;
    }
    // Gemini Pro variants
    if (lower.includes('gemini') && lower.includes('pro')) {
        return ModelFamily.GEMINI_PRO;
    }
    // Claude vision-capable models (sonnet, opus, haiku)
    if (lower.startsWith('claude-') && (lower.includes('sonnet') || lower.includes('opus') || lower.includes('haiku'))) {
        return ModelFamily.CLAUDE;
    }
    // Groq Llama Scout (vision-capable)
    if (lower.includes('llama') && lower.includes('scout')) {
        return ModelFamily.GROQ_LLAMA;
    }
    return null;
}
/**
 * Determine which TextModelFamily a discovered model ID belongs to.
 * Text families are broader than vision — e.g., Groq includes all llama/mixtral models.
 */
function classifyTextModel(modelId) {
    const lower = modelId.toLowerCase();
    // OpenAI GPT text models
    if (lower.startsWith('gpt-') && !lower.includes('instruct')) {
        return TextModelFamily.OPENAI;
    }
    // Gemini Flash variants
    if (lower.includes('gemini') && (lower.includes('flash') || lower.includes('lite'))) {
        return TextModelFamily.GEMINI_FLASH;
    }
    // Gemini Pro variants
    if (lower.includes('gemini') && lower.includes('pro')) {
        return TextModelFamily.GEMINI_PRO;
    }
    // Claude text models (sonnet, opus, haiku — all text-capable)
    if (lower.startsWith('claude-') && (lower.includes('sonnet') || lower.includes('opus') || lower.includes('haiku'))) {
        return TextModelFamily.CLAUDE;
    }
    // Groq text models — broader: llama, mixtral, gemma (NOT scout-only like vision)
    if (lower.includes('llama') || lower.includes('mixtral') || lower.includes('gemma')) {
        return TextModelFamily.GROQ;
    }
    return null;
}
// ─── Service Class ──────────────────────────────────────────────────────
class ModelVersionManager {
    state;
    persistPath;
    discoveryTimer = null;
    lastEventTriggeredDiscovery = 0;
    // Provider API keys (set externally via setApiKeys)
    openaiApiKey = null;
    geminiApiKey = null;
    claudeApiKey = null;
    groqApiKey = null;
    constructor() {
        this.persistPath = path_1.default.join(electron_1.app.getPath('userData'), PERSISTENCE_FILENAME);
        this.state = this.loadState();
    }
    // ─── Client Configuration ──────────────────────────────────────────
    setApiKeys(keys) {
        if (keys.openai !== undefined)
            this.openaiApiKey = keys.openai;
        if (keys.gemini !== undefined)
            this.geminiApiKey = keys.gemini;
        if (keys.claude !== undefined)
            this.claudeApiKey = keys.claude;
        if (keys.groq !== undefined)
            this.groqApiKey = keys.groq;
    }
    // ─── Tier Retrieval ────────────────────────────────────────────────
    /**
     * Get the tiered model IDs for a given family.
     *
     * Tier 1 = promoted stable
     * Tier 2 = latest discovered
     * Tier 3 = same as Tier 2 (pure retry pass with exponential backoff)
     *
     * If no discovery has happened yet, all tiers return the baseline immediately.
     */
    getTieredModels(family) {
        const familyState = this.state.families[family];
        if (!familyState) {
            const baseline = BASELINE_MODELS[family];
            return { tier1: baseline, tier2: baseline, tier3: baseline };
        }
        const latestOrTier1 = familyState.latest || familyState.tier1;
        return {
            tier1: familyState.tier1,
            tier2: latestOrTier1,
            tier3: latestOrTier1,
        };
    }
    /**
     * Get all tiered models for every vision provider in priority order.
     */
    getAllVisionTiers() {
        return exports.VISION_PROVIDER_ORDER.map(family => ({
            family,
            ...this.getTieredModels(family),
        }));
    }
    // ─── Text Tier Retrieval ─────────────────────────────────────────────
    /**
     * Get the tiered text model IDs for a given text family.
     * Same tier logic as vision but with separate baselines.
     */
    getTextTieredModels(family) {
        const familyState = this.state.families[family];
        if (!familyState) {
            const baseline = TEXT_BASELINE_MODELS[family];
            return { tier1: baseline, tier2: baseline, tier3: baseline };
        }
        const latestOrTier1 = familyState.latest || familyState.tier1;
        return {
            tier1: familyState.tier1,
            tier2: latestOrTier1,
            tier3: latestOrTier1,
        };
    }
    /**
     * Get all tiered text models for every text provider in priority order.
     */
    getAllTextTiers() {
        return exports.TEXT_PROVIDER_ORDER.map(family => ({
            family,
            ...this.getTextTieredModels(family),
        }));
    }
    // ─── Event-Driven Discovery ────────────────────────────────────────
    /**
     * Trigger discovery in response to a model-not-found error (404, deprecated, etc).
     * Throttled to at most once per hour to prevent API hammering.
     */
    async onModelError(failedModelId) {
        const now = Date.now();
        if (now - this.lastEventTriggeredDiscovery < EVENT_DISCOVERY_COOLDOWN_MS) {
            console.log(`[ModelVersionManager] Event-driven discovery skipped (cooldown active)`);
            return;
        }
        console.log(`[ModelVersionManager] 🔥 Model error on "${failedModelId}" — triggering discovery`);
        this.lastEventTriggeredDiscovery = now;
        try {
            await this.runDiscoveryAndUpgrade();
        }
        catch (err) {
            console.warn(`[ModelVersionManager] Event-driven discovery failed: ${err.message}`);
        }
    }
    // ─── Rollback ──────────────────────────────────────────────────────
    /**
     * Roll back a specific family (vision or text) to its previous tier state.
     * Useful if a newly promoted model shows degraded performance.
     */
    rollback(family) {
        const familyState = this.state.families[family];
        if (!familyState)
            return false;
        const rolledBack = !!(familyState.previousTier1 || familyState.previousLatest);
        if (familyState.previousTier1) {
            console.log(`[ModelVersionManager] ↩️ Rolling back ${family} Tier1: ${familyState.tier1} → ${familyState.previousTier1}`);
            familyState.tier1 = familyState.previousTier1;
            familyState.tier1Version = parseModelVersion(familyState.previousTier1);
            familyState.previousTier1 = null;
        }
        if (familyState.previousLatest) {
            console.log(`[ModelVersionManager] ↩️ Rolling back ${family} Latest: ${familyState.latest} → ${familyState.previousLatest}`);
            familyState.latest = familyState.previousLatest;
            familyState.latestVersion = parseModelVersion(familyState.previousLatest);
            familyState.previousLatest = null;
        }
        if (rolledBack)
            this.persistState();
        return rolledBack;
    }
    // ─── Discovery ─────────────────────────────────────────────────────
    /**
     * Initialize: run first discovery if stale/never run, then start scheduler.
     *
     * IMPORTANT: This method is always called async (fire-and-forget) from the
     * app startup path. It NEVER blocks the UI thread. If discovery fails or
     * hasn't completed yet, all tiers fall back to the hardcoded baseline
     * models immediately — the app is always usable.
     */
    async initialize() {
        const timeSinceLastDiscovery = Date.now() - this.state.lastDiscoveryTimestamp;
        if (timeSinceLastDiscovery >= DISCOVERY_INTERVAL_MS || this.state.lastDiscoveryTimestamp === 0) {
            console.log('[ModelVersionManager] Running initial model discovery (non-blocking)...');
            try {
                await this.runDiscoveryAndUpgrade();
            }
            catch (err) {
                // Non-fatal: baseline models are always available
                console.warn(`[ModelVersionManager] Initial discovery failed (using baselines): ${err.message}`);
            }
        }
        else {
            const daysUntilNext = Math.round((DISCOVERY_INTERVAL_MS - timeSinceLastDiscovery) / (24 * 60 * 60 * 1000));
            console.log(`[ModelVersionManager] Next scheduled discovery in ~${daysUntilNext} days`);
        }
        this.startBackgroundScheduler();
    }
    /**
     * Query all provider APIs for available models, find the latest in each family,
     * then apply upgrade rules. Each provider query is individually error-handled.
     */
    async runDiscoveryAndUpgrade() {
        console.log('[ModelVersionManager] 🔍 Starting model discovery...');
        const discovered = new Map();
        const textDiscovered = new Map();
        const discoveryPromises = [];
        if (this.openaiApiKey && this.shouldAttemptDiscovery('openai')) {
            discoveryPromises.push(this.discoverOpenAIModels(discovered, textDiscovered));
        }
        if (this.geminiApiKey && this.shouldAttemptDiscovery('gemini')) {
            discoveryPromises.push(this.discoverGeminiModels(discovered, textDiscovered));
        }
        if (this.claudeApiKey && this.shouldAttemptDiscovery('anthropic')) {
            discoveryPromises.push(this.discoverClaudeModels(discovered, textDiscovered));
        }
        if (this.groqApiKey && this.shouldAttemptDiscovery('groq')) {
            discoveryPromises.push(this.discoverGroqModels(discovered, textDiscovered));
        }
        await Promise.allSettled(discoveryPromises);
        // Apply upgrade rules for each discovered vision family
        let upgraded = false;
        for (const [family, { modelId, version }] of discovered) {
            const changed = this.applyUpgradeRules(family, modelId, version);
            if (changed)
                upgraded = true;
        }
        // Apply upgrade rules for each discovered text family
        for (const [family, { modelId, version }] of textDiscovered) {
            const changed = this.applyUpgradeRulesForTextFamily(family, modelId, version);
            if (changed)
                upgraded = true;
        }
        this.state.lastDiscoveryTimestamp = Date.now();
        this.persistState();
        if (upgraded) {
            console.log('[ModelVersionManager] ✅ Model tiers updated and persisted.');
        }
        else {
            console.log('[ModelVersionManager] ✅ Discovery complete. No tier changes needed.');
        }
    }
    // ─── Rate-Limiting for Discovery ───────────────────────────────────
    /**
     * Check if we should attempt discovery for a provider based on failure history.
     * After MAX_DISCOVERY_FAILURES_BEFORE_BACKOFF consecutive failures, we back off
     * exponentially (2x, 4x, 8x of the base interval) before retrying.
     */
    shouldAttemptDiscovery(provider) {
        const failures = this.state.discoveryFailureCounts[provider] || 0;
        if (failures < MAX_DISCOVERY_FAILURES_BEFORE_BACKOFF)
            return true;
        // Exponential backoff: after N failures beyond threshold,
        // skip discovery proportionally
        const backoffFactor = Math.pow(DISCOVERY_BACKOFF_MULTIPLIER, failures - MAX_DISCOVERY_FAILURES_BEFORE_BACKOFF);
        const effectiveInterval = DISCOVERY_INTERVAL_MS * backoffFactor;
        const timeSinceLast = Date.now() - this.state.lastDiscoveryTimestamp;
        if (timeSinceLast < effectiveInterval) {
            console.log(`[ModelVersionManager] Skipping ${provider} discovery (${failures} consecutive failures, backoff ${Math.round(effectiveInterval / (24 * 60 * 60 * 1000))}d)`);
            return false;
        }
        return true;
    }
    recordDiscoverySuccess(provider) {
        this.state.discoveryFailureCounts[provider] = 0;
    }
    recordDiscoveryFailure(provider) {
        this.state.discoveryFailureCounts[provider] = (this.state.discoveryFailureCounts[provider] || 0) + 1;
    }
    // ─── Provider Discovery Implementations ────────────────────────────
    async discoverOpenAIModels(discovered, textDiscovered) {
        try {
            const response = await fetch('https://api.openai.com/v1/models', {
                headers: { Authorization: `Bearer ${this.openaiApiKey}` },
                signal: AbortSignal.timeout(15000),
            });
            if (!response.ok) {
                this.recordDiscoveryFailure('openai');
                console.warn(`[ModelVersionManager] OpenAI model listing failed: ${response.status}`);
                return;
            }
            const json = await response.json();
            const models = (json.data || []).map((m) => m.id);
            this.findLatestInFamily(models, ModelFamily.OPENAI, discovered);
            this.findLatestInTextFamily(models, TextModelFamily.OPENAI, textDiscovered);
            this.recordDiscoverySuccess('openai');
        }
        catch (err) {
            this.recordDiscoveryFailure('openai');
            console.warn(`[ModelVersionManager] OpenAI discovery error: ${err.message}`);
        }
    }
    async discoverGeminiModels(discovered, textDiscovered) {
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${this.geminiApiKey}`, { signal: AbortSignal.timeout(15000) });
            if (!response.ok) {
                this.recordDiscoveryFailure('gemini');
                console.warn(`[ModelVersionManager] Gemini model listing failed: ${response.status}`);
                return;
            }
            const json = await response.json();
            const models = (json.models || []).map((m) => (m.name || '').replace(/^models\//, ''));
            this.findLatestInFamily(models, ModelFamily.GEMINI_FLASH, discovered);
            this.findLatestInFamily(models, ModelFamily.GEMINI_PRO, discovered);
            this.findLatestInTextFamily(models, TextModelFamily.GEMINI_FLASH, textDiscovered);
            this.findLatestInTextFamily(models, TextModelFamily.GEMINI_PRO, textDiscovered);
            this.recordDiscoverySuccess('gemini');
        }
        catch (err) {
            this.recordDiscoveryFailure('gemini');
            console.warn(`[ModelVersionManager] Gemini discovery error: ${err.message}`);
        }
    }
    /**
     * Anthropic model discovery using their official /v1/models endpoint.
     * Handles pagination and sorts by newest first (Anthropic default).
     */
    async discoverClaudeModels(discovered, textDiscovered) {
        try {
            const allModels = [];
            let hasMore = true;
            let afterId = null;
            while (hasMore) {
                const url = afterId
                    ? `https://api.anthropic.com/v1/models?limit=100&after_id=${encodeURIComponent(afterId)}`
                    : 'https://api.anthropic.com/v1/models?limit=100';
                const response = await fetch(url, {
                    headers: {
                        'x-api-key': this.claudeApiKey,
                        'anthropic-version': '2023-06-01',
                    },
                    signal: AbortSignal.timeout(15000),
                });
                if (!response.ok) {
                    this.recordDiscoveryFailure('anthropic');
                    console.warn(`[ModelVersionManager] Anthropic model listing failed: ${response.status}`);
                    return;
                }
                const json = await response.json();
                const pageModels = (json.data || []).map((m) => m.id);
                allModels.push(...pageModels);
                hasMore = json.has_more === true;
                afterId = json.last_id || null;
                // Safety: cap pagination at 5 pages (500 models) to avoid runaway loops
                if (allModels.length > 500) {
                    console.warn('[ModelVersionManager] Anthropic discovery capped at 500 models');
                    break;
                }
            }
            this.findLatestInFamily(allModels, ModelFamily.CLAUDE, discovered);
            this.findLatestInTextFamily(allModels, TextModelFamily.CLAUDE, textDiscovered);
            this.recordDiscoverySuccess('anthropic');
        }
        catch (err) {
            this.recordDiscoveryFailure('anthropic');
            console.warn(`[ModelVersionManager] Anthropic discovery error: ${err.message}`);
        }
    }
    async discoverGroqModels(discovered, textDiscovered) {
        try {
            const response = await fetch('https://api.groq.com/openai/v1/models', {
                headers: { Authorization: `Bearer ${this.groqApiKey}` },
                signal: AbortSignal.timeout(15000),
            });
            if (!response.ok) {
                this.recordDiscoveryFailure('groq');
                console.warn(`[ModelVersionManager] Groq model listing failed: ${response.status}`);
                return;
            }
            const json = await response.json();
            const models = (json.data || []).map((m) => m.id);
            this.findLatestInFamily(models, ModelFamily.GROQ_LLAMA, discovered);
            this.findLatestInTextFamily(models, TextModelFamily.GROQ, textDiscovered);
            this.recordDiscoverySuccess('groq');
        }
        catch (err) {
            this.recordDiscoveryFailure('groq');
            console.warn(`[ModelVersionManager] Groq discovery error: ${err.message}`);
        }
    }
    /**
     * From a list of model IDs, find the highest-versioned one in `family`.
     */
    findLatestInFamily(modelIds, family, discovered) {
        let best = discovered.get(family) || null;
        for (const modelId of modelIds) {
            const classified = classifyModel(modelId);
            if (classified !== family)
                continue;
            const version = parseModelVersion(modelId);
            if (!version)
                continue;
            if (!best || compareVersions(version, best.version) > 0) {
                best = { modelId, version };
            }
        }
        if (best) {
            discovered.set(family, best);
        }
    }
    /**
     * From a list of model IDs, find the highest-versioned one in a text `family`.
     */
    findLatestInTextFamily(modelIds, family, discovered) {
        let best = discovered.get(family) || null;
        for (const modelId of modelIds) {
            const classified = classifyTextModel(modelId);
            if (classified !== family)
                continue;
            const version = parseModelVersion(modelId);
            if (!version)
                continue;
            if (!best || compareVersions(version, best.version) > 0) {
                best = { modelId, version };
            }
        }
        if (best) {
            discovered.set(family, best);
        }
    }
    // ─── Upgrade Rules ─────────────────────────────────────────────────
    /**
     * Apply the tiered upgrade logic for a single model family.
     *
     * Rules:
     *   1. Latest discovered model ALWAYS becomes Tier 2/3 (retry passes).
     *   2. Tier 1 is upgraded only when:
     *      a. Major version jump (5.x → 6.x):
     *         - Tier 1 becomes the PREVIOUS stable latest (last 5.x model)
     *         - Tier 2/3 becomes the new major (6.x)
     *         - This avoids all tiers having the same untested model.
     *      b. 2+ minor versions ahead within same major:
     *         - Tier 1 promoted to the previous latest (proven stepping stone)
     *
     * Previous state is preserved for rollback.
     *
     * Returns true if any tier was changed.
     */
    applyUpgradeRules(family, discoveredModelId, discoveredVersion) {
        const familyState = this.ensureFamilyState(family);
        const prevLatest = familyState.latest;
        const prevTier1 = familyState.tier1;
        // Preserve rollback state BEFORE making changes
        familyState.previousTier1 = familyState.tier1;
        familyState.previousLatest = familyState.latest;
        // Always update Tier 2/3 to the latest discovered
        familyState.latest = discoveredModelId;
        familyState.latestVersion = discoveredVersion;
        // Determine if Tier 1 needs promotion
        const tier1Version = familyState.tier1Version;
        if (tier1Version) {
            const distance = versionDistance(tier1Version, discoveredVersion);
            if (discoveredVersion.major > tier1Version.major) {
                // ─── MAJOR VERSION JUMP ──────────────────────────────────
                // Tier 1 gets the PREVIOUS stable (last model from old major series),
                // NOT the new major version directly. This ensures Tier 1 stays proven
                // while Tier 2/3 test the new major.
                if (prevLatest && prevLatest !== prevTier1) {
                    const prevLatestVersion = parseModelVersion(prevLatest);
                    if (prevLatestVersion && compareVersions(prevLatestVersion, tier1Version) > 0) {
                        console.log(`[ModelVersionManager] 🚀 MAJOR upgrade for ${family}: ` +
                            `Tier1 → ${prevLatest} (last stable), Tier2/3 → ${discoveredModelId} (new major)`);
                        familyState.tier1 = prevLatest;
                        familyState.tier1Version = prevLatestVersion;
                    }
                }
                // If no previous latest exists, Tier 1 stays at current (conservative)
                // Tier 2/3 already updated to the new major version above
            }
            else if (distance >= 2) {
                // ─── 2+ MINOR VERSIONS AHEAD ─────────────────────────────
                // Promote Tier 1 to the previous latest (proven stepping stone)
                if (prevLatest && prevLatest !== prevTier1) {
                    const prevLatestVersion = parseModelVersion(prevLatest);
                    if (prevLatestVersion && compareVersions(prevLatestVersion, tier1Version) > 0) {
                        console.log(`[ModelVersionManager] ⬆️ Tier 1 promotion for ${family}: ` +
                            `${tier1Version.raw} → ${prevLatest} (${distance.toFixed(1)} minor versions behind)`);
                        familyState.tier1 = prevLatest;
                        familyState.tier1Version = prevLatestVersion;
                    }
                }
            }
        }
        const changed = familyState.latest !== prevLatest || familyState.tier1 !== prevTier1;
        // Don't clutter rollback state if nothing actually changed
        if (!changed) {
            familyState.previousTier1 = null;
            familyState.previousLatest = null;
        }
        else {
            console.log(`[ModelVersionManager] ${family} tiers: ` +
                `Tier1=${familyState.tier1}, Tier2/3=${familyState.latest}`);
        }
        return changed;
    }
    /**
     * Apply the same tiered upgrade logic for text model families.
     * Identical rules to vision but uses TextModelFamily and TEXT_BASELINE_MODELS.
     */
    applyUpgradeRulesForTextFamily(family, discoveredModelId, discoveredVersion) {
        const familyState = this.ensureTextFamilyState(family);
        const prevLatest = familyState.latest;
        const prevTier1 = familyState.tier1;
        // Preserve rollback state
        familyState.previousTier1 = familyState.tier1;
        familyState.previousLatest = familyState.latest;
        // Always update Tier 2/3
        familyState.latest = discoveredModelId;
        familyState.latestVersion = discoveredVersion;
        const tier1Version = familyState.tier1Version;
        if (tier1Version) {
            const distance = versionDistance(tier1Version, discoveredVersion);
            if (discoveredVersion.major > tier1Version.major) {
                // Major jump: Tier 1 → previous stable, Tier 2/3 → new major
                if (prevLatest && prevLatest !== prevTier1) {
                    const prevLatestVersion = parseModelVersion(prevLatest);
                    if (prevLatestVersion && compareVersions(prevLatestVersion, tier1Version) > 0) {
                        console.log(`[ModelVersionManager] 🚀 MAJOR text upgrade for ${family}: ` +
                            `Tier1 → ${prevLatest}, Tier2/3 → ${discoveredModelId}`);
                        familyState.tier1 = prevLatest;
                        familyState.tier1Version = prevLatestVersion;
                    }
                }
            }
            else if (distance >= 2) {
                // 2+ minor versions: promote Tier 1
                if (prevLatest && prevLatest !== prevTier1) {
                    const prevLatestVersion = parseModelVersion(prevLatest);
                    if (prevLatestVersion && compareVersions(prevLatestVersion, tier1Version) > 0) {
                        console.log(`[ModelVersionManager] ⬆️ Text Tier 1 promotion for ${family}: ` +
                            `${tier1Version.raw} → ${prevLatest}`);
                        familyState.tier1 = prevLatest;
                        familyState.tier1Version = prevLatestVersion;
                    }
                }
            }
        }
        const changed = familyState.latest !== prevLatest || familyState.tier1 !== prevTier1;
        if (!changed) {
            familyState.previousTier1 = null;
            familyState.previousLatest = null;
        }
        else {
            console.log(`[ModelVersionManager] ${family} text tiers: ` +
                `Tier1=${familyState.tier1}, Tier2/3=${familyState.latest}`);
        }
        return changed;
    }
    // ─── Background Scheduler ──────────────────────────────────────────
    startBackgroundScheduler() {
        if (this.discoveryTimer)
            return;
        this.discoveryTimer = setInterval(async () => {
            console.log('[ModelVersionManager] ⏰ Scheduled model discovery triggered');
            try {
                await this.runDiscoveryAndUpgrade();
            }
            catch (err) {
                console.error('[ModelVersionManager] Scheduled discovery failed:', err.message);
            }
        }, DISCOVERY_INTERVAL_MS);
        // Don't block app exit
        if (this.discoveryTimer && typeof this.discoveryTimer === 'object' && 'unref' in this.discoveryTimer) {
            this.discoveryTimer.unref();
        }
        console.log('[ModelVersionManager] 📅 Background scheduler started (every ~14 days)');
    }
    stopScheduler() {
        if (this.discoveryTimer) {
            clearInterval(this.discoveryTimer);
            this.discoveryTimer = null;
            console.log('[ModelVersionManager] Background scheduler stopped');
        }
    }
    // ─── State Persistence ─────────────────────────────────────────────
    loadState() {
        try {
            if (fs_1.default.existsSync(this.persistPath)) {
                const raw = fs_1.default.readFileSync(this.persistPath, 'utf-8');
                const parsed = JSON.parse(raw);
                if (parsed.schemaVersion === SCHEMA_VERSION) {
                    console.log('[ModelVersionManager] Loaded persisted state from disk');
                    this.reconcileBaselines(parsed);
                    return parsed;
                }
                // Schema migration: v3 → v4 (forces baseline reconciliation for stale Gemini 1.5 entries)
                if (parsed.schemaVersion === 3) {
                    console.log('[ModelVersionManager] Migrating v3 → v4 state (reconciling stale baselines)');
                    this.reconcileBaselines(parsed);
                    parsed.schemaVersion = SCHEMA_VERSION;
                    return parsed;
                }
                // Schema migration: preserve what we can from v1
                if (parsed.schemaVersion === 1) {
                    console.log('[ModelVersionManager] Migrating v1 → v3 state');
                    const migrated = this.createDefaultState();
                    for (const [family, state] of Object.entries(parsed.families || {})) {
                        if (migrated.families[family]) {
                            migrated.families[family].tier1 = state.tier1 || migrated.families[family].tier1;
                            migrated.families[family].latest = state.latest || migrated.families[family].latest;
                            migrated.families[family].tier1Version = parseModelVersion(migrated.families[family].tier1);
                            migrated.families[family].latestVersion = parseModelVersion(migrated.families[family].latest);
                        }
                    }
                    migrated.lastDiscoveryTimestamp = parsed.lastDiscoveryTimestamp || 0;
                    return migrated;
                }
                // Schema migration: v2 → v3 (add text families)
                if (parsed.schemaVersion === 2) {
                    console.log('[ModelVersionManager] Migrating v2 → v3 state (adding text families)');
                    // Carry over all existing vision families, add text families
                    for (const txtFamily of Object.values(TextModelFamily)) {
                        if (!parsed.families[txtFamily]) {
                            const baseline = TEXT_BASELINE_MODELS[txtFamily];
                            const version = parseModelVersion(baseline);
                            parsed.families[txtFamily] = {
                                baseline,
                                tier1: baseline,
                                latest: baseline,
                                latestVersion: version,
                                tier1Version: version,
                                previousTier1: null,
                                previousLatest: null,
                            };
                        }
                    }
                    parsed.schemaVersion = SCHEMA_VERSION;
                    return parsed;
                }
                console.warn('[ModelVersionManager] Unrecognized schema version, reinitializing');
            }
        }
        catch (err) {
            console.warn(`[ModelVersionManager] Failed to load state: ${err.message}`);
        }
        return this.createDefaultState();
    }
    /**
     * Reset any family whose persisted baseline diverges from the current
     * hardcoded baseline. This handles the case where a dev bumps a baseline
     * in code (e.g. retired Gemini 1.5 → Gemini 3.1) — without this, loaders
     * would keep promoting the stale baseline as Tier 1 indefinitely.
     *
     * Also resets families whose tier1 is older than the current baseline
     * (defensive — catches any other source of drift).
     */
    reconcileBaselines(state) {
        const expected = {
            ...BASELINE_MODELS,
            ...TEXT_BASELINE_MODELS,
        };
        for (const [family, currentBaseline] of Object.entries(expected)) {
            const entry = state.families[family];
            if (!entry)
                continue;
            const baselineVersion = parseModelVersion(currentBaseline);
            const baselineMismatch = entry.baseline !== currentBaseline;
            const tier1OlderThanBaseline = baselineVersion &&
                entry.tier1Version &&
                compareVersions(entry.tier1Version, baselineVersion) < 0;
            if (baselineMismatch || tier1OlderThanBaseline) {
                console.log(`[ModelVersionManager] 🔄 Reconciling stale family "${family}": ` +
                    `baseline ${entry.baseline} → ${currentBaseline}, tier1 ${entry.tier1} → ${currentBaseline}`);
                entry.baseline = currentBaseline;
                entry.tier1 = currentBaseline;
                entry.tier1Version = baselineVersion;
                entry.previousTier1 = null;
                const latestStillValid = baselineVersion &&
                    entry.latestVersion &&
                    compareVersions(entry.latestVersion, baselineVersion) >= 0;
                if (!latestStillValid) {
                    entry.latest = currentBaseline;
                    entry.latestVersion = baselineVersion;
                }
                entry.previousLatest = null;
            }
        }
    }
    persistState() {
        if (!this.persistPath)
            return;
        try {
            const dir = path_1.default.dirname(this.persistPath);
            if (!fs_1.default.existsSync(dir)) {
                fs_1.default.mkdirSync(dir, { recursive: true });
            }
            const tmpPath = this.persistPath + '.tmp';
            fs_1.default.writeFileSync(tmpPath, JSON.stringify(this.state, null, 2), 'utf-8');
            fs_1.default.renameSync(tmpPath, this.persistPath);
        }
        catch (e) {
            console.error('[ModelVersionManager] Failed to save state to disk', e);
        }
    }
    createDefaultState() {
        const families = {};
        // Vision families
        for (const family of Object.values(ModelFamily)) {
            const baseline = BASELINE_MODELS[family];
            const version = parseModelVersion(baseline);
            families[family] = {
                baseline,
                tier1: baseline,
                latest: baseline,
                latestVersion: version,
                tier1Version: version,
                previousTier1: null,
                previousLatest: null,
            };
        }
        // Text families
        for (const family of Object.values(TextModelFamily)) {
            const baseline = TEXT_BASELINE_MODELS[family];
            const version = parseModelVersion(baseline);
            families[family] = {
                baseline,
                tier1: baseline,
                latest: baseline,
                latestVersion: version,
                tier1Version: version,
                previousTier1: null,
                previousLatest: null,
            };
        }
        return {
            families,
            lastDiscoveryTimestamp: 0,
            discoveryFailureCounts: {},
            schemaVersion: SCHEMA_VERSION,
        };
    }
    ensureFamilyState(family) {
        if (!this.state.families[family]) {
            const baseline = BASELINE_MODELS[family];
            const version = parseModelVersion(baseline);
            this.state.families[family] = {
                baseline,
                tier1: baseline,
                latest: baseline,
                latestVersion: version,
                tier1Version: version,
                previousTier1: null,
                previousLatest: null,
            };
        }
        return this.state.families[family];
    }
    ensureTextFamilyState(family) {
        if (!this.state.families[family]) {
            const baseline = TEXT_BASELINE_MODELS[family];
            const version = parseModelVersion(baseline);
            this.state.families[family] = {
                baseline,
                tier1: baseline,
                latest: baseline,
                latestVersion: version,
                tier1Version: version,
                previousTier1: null,
                previousLatest: null,
            };
        }
        return this.state.families[family];
    }
    // ─── Debug / Diagnostics ───────────────────────────────────────────
    /**
     * Return a human-readable summary of current model tiers.
     */
    getSummary() {
        const lines = ['[ModelVersionManager] Current Model Tiers:'];
        lines.push('  --- Vision ---');
        for (const family of exports.VISION_PROVIDER_ORDER) {
            const tiers = this.getTieredModels(family);
            lines.push(`  ${family}: T1=${tiers.tier1} | T2/T3=${tiers.tier2}`);
        }
        lines.push('  --- Text ---');
        for (const family of exports.TEXT_PROVIDER_ORDER) {
            const tiers = this.getTextTieredModels(family);
            lines.push(`  ${family}: T1=${tiers.tier1} | T2/T3=${tiers.tier2}`);
        }
        // Show rollback availability (both vision and text)
        const allFamilyKeys = [
            ...exports.VISION_PROVIDER_ORDER.map(f => f),
            ...exports.TEXT_PROVIDER_ORDER.map(f => f),
        ];
        const rollbackAvailable = allFamilyKeys.filter(f => {
            const s = this.state.families[f];
            return s && (s.previousTier1 || s.previousLatest);
        });
        if (rollbackAvailable.length > 0) {
            lines.push(`  Rollback available for: ${rollbackAvailable.join(', ')}`);
        }
        lines.push(`  Last discovery: ${this.state.lastDiscoveryTimestamp
            ? new Date(this.state.lastDiscoveryTimestamp).toISOString()
            : 'never'}`);
        lines.push(`  Discovery interval: 14 days`);
        return lines.join('\n');
    }
}
exports.ModelVersionManager = ModelVersionManager;
//# sourceMappingURL=ModelVersionManager.js.map
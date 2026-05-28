"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderRouter = exports.CircuitBreaker = exports.ProviderScopeError = void 0;
exports.getDeniedDataScopes = getDeniedDataScopes;
exports.assertProviderDataScopes = assertProviderDataScopes;
exports.hasLocalFallbackAvailable = hasLocalFallbackAvailable;
exports.routeLLMProviders = routeLLMProviders;
exports.routeWithScopeFallback = routeWithScopeFallback;
class ProviderScopeError extends Error {
    provider;
    deniedScopes;
    constructor(provider, deniedScopes) {
        super(`Provider ${provider} blocked by data scope policy: ${deniedScopes.join(', ')}`);
        this.provider = provider;
        this.deniedScopes = deniedScopes;
        this.name = 'ProviderScopeError';
    }
}
exports.ProviderScopeError = ProviderScopeError;
function getDeniedDataScopes(scopes = [], policy) {
    return scopes.filter(scope => policy?.[scope] === false);
}
function assertProviderDataScopes(provider, scopes = [], policy) {
    const denied = getDeniedDataScopes(scopes, policy);
    if (denied.length > 0) {
        throw new ProviderScopeError(provider, denied);
    }
}
function statusFor(spec, capability, deniedScopes = []) {
    if (!spec.supports.includes(capability)) {
        return { status: 'unavailable', unavailableReason: 'unsupported_capability' };
    }
    if (deniedScopes.length > 0) {
        return { status: 'unavailable', unavailableReason: 'disabled' };
    }
    if (spec.available)
        return { status: 'available' };
    return { status: 'unavailable', unavailableReason: spec.unavailableReason ?? 'missing_api_key' };
}
function hasLocalFallbackAvailable(ollamaModels) {
    return Array.isArray(ollamaModels) && ollamaModels.some(model => typeof model === 'string' && model.trim().length > 0);
}
function routeLLMProviders(options) {
    const availability = { ...options.availability };
    const models = { ...options.models };
    const capability = options.capability;
    const natively = {
        provider: 'natively',
        name: 'Natively API',
        model: models.natively,
        available: Boolean(availability.hasNatively),
        unavailableReason: 'missing_api_key',
        supports: ['chat', 'stream_chat', 'vision'],
    };
    const groq = {
        provider: 'groq',
        name: `Groq (${models.groq ?? 'default'})`,
        model: models.groq,
        available: Boolean(availability.hasGroq) && !availability.groqDisabled,
        unavailableReason: availability.groqDisabled ? 'disabled' : 'missing_api_key',
        supports: ['chat', 'stream_chat', 'structured', 'vision'],
    };
    const codex = {
        provider: 'codex',
        name: `Codex CLI (${models.codex ?? 'default'})`,
        model: models.codex,
        available: Boolean(availability.hasCodex),
        unavailableReason: 'missing_config',
        supports: ['chat', 'stream_chat', 'structured', 'vision'],
    };
    const geminiFlash = {
        provider: 'gemini_flash',
        name: `Gemini Flash (${models.geminiFlash ?? 'default'})`,
        model: models.geminiFlash,
        available: Boolean(availability.hasGemini),
        unavailableReason: 'missing_api_key',
        supports: ['chat', 'stream_chat', 'vision'],
    };
    const geminiPro = {
        provider: 'gemini_pro',
        name: `Gemini Pro (${models.geminiPro ?? 'default'})`,
        model: models.geminiPro,
        available: Boolean(availability.hasGemini),
        unavailableReason: 'missing_api_key',
        supports: ['chat', 'stream_chat', 'structured', 'vision'],
    };
    const openai = {
        provider: 'openai',
        name: `OpenAI (${models.openai ?? 'default'})`,
        model: models.openai,
        available: Boolean(availability.hasOpenAI),
        unavailableReason: 'missing_api_key',
        supports: ['chat', 'stream_chat', 'structured', 'vision'],
    };
    const claude = {
        provider: 'claude',
        name: `Claude (${models.claude ?? 'default'})`,
        model: models.claude,
        available: Boolean(availability.hasClaude),
        unavailableReason: 'missing_api_key',
        supports: ['chat', 'stream_chat', 'structured', 'vision'],
    };
    const ollama = {
        provider: 'ollama',
        name: `Ollama (${models.ollama ?? 'local'})`,
        model: models.ollama,
        available: Boolean(availability.hasOllama),
        unavailableReason: 'missing_config',
        supports: ['chat', 'stream_chat', 'structured', 'vision'],
    };
    const orderedSpecs = options.multimodal
        ? [natively, codex, openai, geminiFlash, claude, geminiPro, groq]
        : [natively, groq, codex, geminiFlash, geminiPro, openai, claude];
    if (availability.hasOllama) {
        orderedSpecs.push(ollama);
    }
    const deniedScopes = getDeniedDataScopes(options.dataScopes, options.scopePolicy);
    return orderedSpecs.map(spec => ({
        provider: spec.provider,
        name: spec.name,
        capability,
        model: spec.model,
        ...statusFor(spec, capability, spec.provider === 'ollama' && spec.available ? [] : deniedScopes),
    }));
}
function routeWithScopeFallback(options) {
    return routeLLMProviders(options);
}
// Vision-capable providers (ordered by capability)
const VISION_PROVIDERS = ['gemini', 'claude', 'openai', 'groq'];
// Low-latency providers (ordered by speed)
const LOW_LATENCY_PROVIDERS = ['groq', 'gemini'];
// Quality providers (for summary/recap tasks)
const QUALITY_PROVIDERS = ['claude', 'openai', 'gemini_pro'];
// Local providers (for privacy mode)
const LOCAL_PROVIDERS = ['ollama', 'custom'];
class CircuitBreaker {
    provider;
    config;
    failureCount = 0;
    lastFailure = 0;
    state = 'closed';
    halfOpenCalls = 0;
    constructor(provider, config) {
        this.provider = provider;
        this.config = config;
    }
    recordSuccess() {
        this.failureCount = 0;
        this.state = 'closed';
        this.halfOpenCalls = 0;
    }
    recordFailure() {
        this.failureCount++;
        this.lastFailure = Date.now();
        if (this.state === 'half-open') {
            this.halfOpenCalls++;
            if (this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
                this.state = 'open';
            }
        }
        else if (this.failureCount >= this.config.threshold) {
            this.state = 'open';
        }
    }
    canExecute() {
        if (this.state === 'closed')
            return true;
        if (this.state === 'open') {
            const elapsed = Date.now() - this.lastFailure;
            if (elapsed >= this.config.resetTimeout) {
                this.state = 'half-open';
                this.halfOpenCalls = 0;
                return true;
            }
            return false;
        }
        // half-open: allow limited calls
        return this.halfOpenCalls < this.config.halfOpenMaxCalls;
    }
    get timeUntilRetry() {
        if (this.state !== 'open')
            return 0;
        const elapsed = Date.now() - this.lastFailure;
        return Math.max(0, this.config.resetTimeout - elapsed);
    }
}
exports.CircuitBreaker = CircuitBreaker;
class ProviderRouter {
    circuitBreakers = new Map();
    defaultCircuitConfig = {
        threshold: 5,
        resetTimeout: 30000,
        halfOpenMaxCalls: 1
    };
    constructor(circuitConfig) {
        const config = { ...this.defaultCircuitConfig, ...circuitConfig };
        // Initialize circuit breakers for each provider
        ['gemini', 'groq', 'openai', 'claude', 'natively', 'codex'].forEach(provider => {
            this.circuitBreakers.set(provider, new CircuitBreaker(provider, config));
        });
    }
    /**
     * Select the best provider based on routing policy
     */
    selectProvider(policy) {
        const health = policy.providerHealth || {};
        // Rule 1: Local-only mode -> only local providers
        if (policy.privacySetting === 'local-only') {
            return {
                provider: 'ollama',
                model: 'local',
                reason: 'local-only mode: using local provider'
            };
        }
        // Rule 2: Check circuit breakers and skip unhealthy providers
        const availableProviders = this.filterHealthyProviders(['gemini', 'groq', 'openai', 'claude', 'natively', 'codex'], health);
        if (availableProviders.length === 0) {
            // All providers down, return lowest priority
            return {
                provider: 'gemini',
                model: 'gemini-3.1-flash-lite-preview',
                reason: 'all providers unhealthy, using Gemini as last resort'
            };
        }
        // Rule 3: Vision request -> prefer vision-capable providers
        if (policy.needsVision) {
            const visionProvider = this.selectFromCapabilities(availableProviders, VISION_PROVIDERS, 'vision', health);
            if (visionProvider)
                return visionProvider;
        }
        // Rule 4: Low-latency request -> prefer fast providers
        if (policy.preferLowLatency) {
            const fastProvider = this.selectFromCapabilities(availableProviders, LOW_LATENCY_PROVIDERS, 'low-latency', health);
            if (fastProvider)
                return fastProvider;
        }
        // Rule 5: Summary/recap -> quality over speed
        if (policy.actionType === 'summary' || policy.actionType === 'recap') {
            const qualityProvider = this.selectFromCapabilities(availableProviders, QUALITY_PROVIDERS, 'quality', health);
            if (qualityProvider)
                return qualityProvider;
        }
        // Rule 6: Mode-based routing (future enhancement hook)
        if (policy.mode) {
            const modeProvider = this.getModeProvider(policy.mode, availableProviders, health);
            if (modeProvider)
                return modeProvider;
        }
        // Default: Groq for speed (most bang for buck on free tier)
        return {
            provider: 'groq',
            model: 'llama-3.3-70b-versatile',
            reason: 'default routing: Groq (fastest free tier)'
        };
    }
    filterHealthyProviders(providers, health) {
        return providers.filter(p => {
            const status = health[p];
            return status !== 'down' && this.getCircuitBreaker(p).canExecute();
        });
    }
    selectFromCapabilities(available, preference, reason, health) {
        for (const provider of preference) {
            if (available.includes(provider) && health[provider] !== 'down') {
                return {
                    provider,
                    model: this.getDefaultModel(provider),
                    reason: `${reason}: selected ${provider}`
                };
            }
        }
        return null;
    }
    getModeProvider(mode, available, health) {
        // Mode-specific routing (simplified)
        const modePreferences = {
            'sales': ['groq', 'gemini', 'openai'],
            'recruiting': ['claude', 'groq', 'gemini'],
            'interview': ['gemini', 'groq', 'openai'],
            'default': ['groq', 'gemini', 'openai']
        };
        const preferences = modePreferences[mode] || modePreferences['default'];
        return this.selectFromCapabilities(available, preferences, `mode:${mode}`, health);
    }
    getDefaultModel(provider) {
        const models = {
            'gemini': 'gemini-3.1-flash-lite-preview',
            'groq': 'llama-3.3-70b-versatile',
            'openai': 'gpt-5.4',
            'claude': 'claude-sonnet-4-6',
            'natively': 'default',
            'codex': 'default'
        };
        return models[provider] || 'default';
    }
    getCircuitBreaker(provider) {
        let cb = this.circuitBreakers.get(provider);
        if (!cb) {
            cb = new CircuitBreaker(provider, this.defaultCircuitConfig);
            this.circuitBreakers.set(provider, cb);
        }
        return cb;
    }
    recordSuccess(provider) {
        this.getCircuitBreaker(provider).recordSuccess();
    }
    recordFailure(provider) {
        this.getCircuitBreaker(provider).recordFailure();
    }
    getProviderHealth() {
        const health = {};
        this.circuitBreakers.forEach((cb, provider) => {
            if (cb.state === 'closed')
                health[provider] = 'healthy';
            else if (cb.state === 'half-open')
                health[provider] = 'degraded';
            else
                health[provider] = 'down';
        });
        return health;
    }
}
exports.ProviderRouter = ProviderRouter;
//# sourceMappingURL=ProviderRouter.js.map
"use strict";
// electron/services/screen/VisionProviderFallbackChain.ts
//
// Vision-first provider fallback chain.
//
// Replaces the legacy OCR/vision-mixed routing inside ScreenUnderstandingService.
// This module tries every CONFIGURED vision-capable provider in a safe, low-latency
// order, with hard per-provider timeouts, scope/privacy enforcement, and redacted
// telemetry. The first provider that returns non-empty output wins.
//
// Provider order (vision_first / vision_only):
//   1. Natively API (if configured)
//   2. OpenAI vision (if configured)
//   3. Gemini Flash vision (if configured)
//   4. Claude vision (if configured)
//   5. Gemini Pro vision (if configured)
//   6. Groq Llama-4-Scout vision (if configured)
//   7. Ollama local vision (if configured AND the active Ollama model is vision-capable)
//   8. Codex CLI vision (if enabled AND CLI supports vision)
//   9. Custom cURL provider (only if multimodal=true AND screenshots scope enabled)
//
// Provider order (private_vision): only steps 7–9, and step 9 only if the custom
// provider is flagged local-only.
//
// Telemetry redaction:
//   - We never log image paths, base64 payloads, or full prompts.
//   - We log provider name, model id, ok/skipped/error code, duration.
//   - Errors are classified into safe buckets (timeout, rate_limited, no_vision,
//     provider_error, network, auth_error).
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runVisionFallback = runVisionFallback;
const promises_1 = __importDefault(require("node:fs/promises"));
const ImageOptimizer_1 = require("./ImageOptimizer");
const DEFAULT_PER_PROVIDER_TIMEOUT_MS = 12_000;
// ─── Implementation ───────────────────────────────────────────────────────
/**
 * Run a vision-provider fallback chain.
 *
 * Behavior:
 *   - Optimizes the image ONCE up front (per provider hint when possible). We
 *     re-encode per provider only if the hint differs in a way that changes the
 *     payload (e.g. Ollama may want a smaller buffer than Claude).
 *   - Tries each configured + vision-capable provider in order.
 *   - Honors privacy/scope:
 *       - private_vision: skip every non-local provider with skipReason='privacy_blocked'.
 *       - scopeAllowsScreenshots=false: skip with skipReason='scope_blocked'.
 *   - Each provider attempt is wrapped in an AbortController with `perProviderTimeoutMs`.
 *   - On the first non-empty success, returns immediately.
 *   - If every provider is skipped, returns failureReason='no_vision_provider'
 *     (or 'privacy_blocked' / 'scope_blocked' when those reasons dominate).
 *   - If providers were attempted but none succeeded, returns 'all_vision_failed'.
 */
async function runVisionFallback(params) {
    const started = Date.now();
    const optimizer = params.optimizer ?? (0, ImageOptimizer_1.getImageOptimizer)();
    const perProviderTimeoutMs = params.perProviderTimeoutMs ?? DEFAULT_PER_PROVIDER_TIMEOUT_MS;
    const totalDeadlineMs = params.totalDeadlineMs;
    const attempts = [];
    // Validate source exists once so we don't keep re-statting per provider.
    try {
        await promises_1.default.stat(params.imagePath);
    }
    catch (err) {
        return {
            ok: false,
            attempts: [],
            failureReason: 'all_vision_failed',
            durationMs: Date.now() - started,
        };
    }
    // Track skip reasons so we can pick the most specific failureReason later.
    let sawScopeBlocked = false;
    let sawPrivacyBlocked = false;
    let sawAtLeastOneAttempt = false;
    for (let i = 0; i < params.providers.length; i++) {
        const provider = params.providers[i];
        // 1. configured check
        if (!provider.isConfigured) {
            attempts.push({
                provider: provider.id,
                model: provider.modelId,
                ok: false,
                skipped: true,
                skipReason: 'not_configured',
                durationMs: 0,
            });
            params.telemetry?.({ type: 'vision_skipped', provider: provider.id, reason: 'not_configured' });
            continue;
        }
        // 2. vision capability check
        if (!provider.supportsVision) {
            attempts.push({
                provider: provider.id,
                model: provider.modelId,
                ok: false,
                skipped: true,
                skipReason: 'no_vision',
                durationMs: 0,
            });
            params.telemetry?.({ type: 'vision_skipped', provider: provider.id, reason: 'no_vision' });
            continue;
        }
        // 3. scope check (custom-provider screenshots data scope)
        if (!provider.scopeAllowsScreenshots) {
            attempts.push({
                provider: provider.id,
                model: provider.modelId,
                ok: false,
                skipped: true,
                skipReason: 'scope_blocked',
                durationMs: 0,
            });
            params.telemetry?.({ type: 'vision_skipped', provider: provider.id, reason: 'scope_blocked' });
            sawScopeBlocked = true;
            continue;
        }
        // 4. privacy check: private_vision forbids any non-local provider
        if (params.mode === 'private_vision' && !provider.isLocal) {
            attempts.push({
                provider: provider.id,
                model: provider.modelId,
                ok: false,
                skipped: true,
                skipReason: 'privacy_blocked',
                durationMs: 0,
            });
            params.telemetry?.({ type: 'vision_skipped', provider: provider.id, reason: 'privacy_blocked' });
            sawPrivacyBlocked = true;
            continue;
        }
        // 5. total-deadline check
        if (totalDeadlineMs && Date.now() - started > totalDeadlineMs) {
            attempts.push({
                provider: provider.id,
                model: provider.modelId,
                ok: false,
                errorClass: 'timeout',
                durationMs: 0,
            });
            params.telemetry?.({ type: 'vision_failed', provider: provider.id, errorClass: 'timeout', durationMs: 0 });
            break;
        }
        // 6. optimize for this provider hint
        let optimized;
        try {
            optimized = await optimizer.optimize(params.imagePath, {
                profile: params.optimizationProfile || 'balanced',
                provider: provider.hint,
                cacheKey: params.cacheKey,
            });
        }
        catch (err) {
            attempts.push({
                provider: provider.id,
                model: provider.modelId,
                ok: false,
                errorClass: 'invalid_payload',
                durationMs: 0,
            });
            params.telemetry?.({ type: 'vision_failed', provider: provider.id, errorClass: 'invalid_payload', durationMs: 0 });
            continue;
        }
        // 7. invoke with timeout
        sawAtLeastOneAttempt = true;
        params.telemetry?.({ type: 'vision_attempt', provider: provider.id, model: provider.modelId });
        const providerStarted = Date.now();
        const controller = new AbortController();
        const timeoutMs = provider.timeoutMs ?? perProviderTimeoutMs;
        const timer = setTimeout(() => controller.abort(new Error('per-provider-timeout')), timeoutMs);
        try {
            const output = await provider.invoke({
                optimized,
                systemPrompt: params.systemPrompt,
                userPrompt: params.userPrompt,
                signal: controller.signal,
            });
            clearTimeout(timer);
            const durationMs = Date.now() - providerStarted;
            if (typeof output === 'string' && output.trim().length > 0) {
                attempts.push({
                    provider: provider.id,
                    model: provider.modelId,
                    ok: true,
                    durationMs,
                });
                params.telemetry?.({ type: 'vision_success', provider: provider.id, model: provider.modelId, durationMs });
                return {
                    ok: true,
                    providerUsed: provider.id,
                    modelUsed: provider.modelId,
                    outputText: output,
                    attempts,
                    durationMs: Date.now() - started,
                };
            }
            // Empty output → treat as provider error and continue.
            attempts.push({
                provider: provider.id,
                model: provider.modelId,
                ok: false,
                errorClass: 'provider_error',
                durationMs,
            });
            params.telemetry?.({ type: 'vision_failed', provider: provider.id, errorClass: 'provider_error', durationMs });
            if (i < params.providers.length - 1) {
                const next = params.providers[i + 1];
                params.telemetry?.({ type: 'vision_fallback', from: provider.id, to: next.id });
            }
        }
        catch (err) {
            clearTimeout(timer);
            const durationMs = Date.now() - providerStarted;
            const errorClass = classifyError(err, controller.signal.aborted);
            attempts.push({
                provider: provider.id,
                model: provider.modelId,
                ok: false,
                errorClass,
                durationMs,
            });
            params.telemetry?.({ type: 'vision_failed', provider: provider.id, errorClass, durationMs });
            if (i < params.providers.length - 1) {
                const next = params.providers[i + 1];
                params.telemetry?.({ type: 'vision_fallback', from: provider.id, to: next.id });
            }
        }
    }
    // No provider succeeded. Pick the most specific failure reason.
    let failureReason;
    if (sawAtLeastOneAttempt) {
        failureReason = 'all_vision_failed';
    }
    else if (params.mode === 'private_vision' && sawPrivacyBlocked && !sawScopeBlocked) {
        failureReason = 'privacy_blocked';
    }
    else if (sawScopeBlocked && !sawPrivacyBlocked) {
        failureReason = 'scope_blocked';
    }
    else {
        failureReason = 'no_vision_provider';
    }
    return {
        ok: false,
        attempts,
        failureReason,
        durationMs: Date.now() - started,
    };
}
// Map a raw error onto one of our redacted error classes. No message bodies are
// exposed to telemetry — only the class.
function classifyError(err, aborted) {
    if (aborted)
        return 'timeout';
    const msg = String(err?.message || err || '').toLowerCase();
    if (msg.includes('timeout') || msg.includes('aborted') || msg.includes('etimedout'))
        return 'timeout';
    if (msg.includes('429') || msg.includes('rate') || msg.includes('quota'))
        return 'rate_limited';
    if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized') || msg.includes('forbidden') || msg.includes('api key') || msg.includes('invalid_api'))
        return 'auth_error';
    if (msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('network') || msg.includes('fetch failed'))
        return 'network';
    if (msg.includes('does not support') || msg.includes('no vision') || msg.includes('image not supported'))
        return 'no_vision';
    if (msg.includes('payload') || msg.includes('too large') || msg.includes('413'))
        return 'invalid_payload';
    if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504'))
        return 'provider_error';
    return 'unknown';
}
//# sourceMappingURL=VisionProviderFallbackChain.js.map
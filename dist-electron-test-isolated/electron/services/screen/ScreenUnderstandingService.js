"use strict";
// electron/services/screen/ScreenUnderstandingService.ts
//
// VISION-FIRST screen understanding pipeline for Natively.
//
// Flow:
//   request
//   → resolve image paths (or capture if missing)
//   → validate paths (defense-in-depth — IPC handler also validates)
//   → perceptual hash for cache/dedupe
//   → build provider list via buildVisionProviders() — order depends on mode
//   → runVisionFallback() — first non-empty success wins
//   → classify result into a ScreenUnderstandingResult
//
// What this service NO LONGER does (legacy OCR pivot, 2026-05-17):
//   - Tesseract OCR. Removed from the default path. The old OcrProviderManager
//     still exists for tests but is not invoked here.
//   - "OCR-first, vision when warranted" branching. Vision is always the path.
//   - Modes 'auto' / 'ocr_only' / 'private' (with local OCR). Replaced by
//     vision_first / vision_only / private_vision (see SettingsManager).
//
// What this service intentionally does NOT do:
//   - Hold provider API clients. Those live in LLMHelper. We declare a thin
//     ProviderInvoker contract so tests can inject fake providers and the
//     production wiring uses LLMHelper-backed adapters.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScreenUnderstandingService = void 0;
exports.getScreenUnderstandingService = getScreenUnderstandingService;
const electron_1 = require("electron");
const curlUtils_1 = require("../../utils/curlUtils");
const ImageHashService_1 = require("./ImageHashService");
const VisionProviderFallbackChain_1 = require("./VisionProviderFallbackChain");
const ImageOptimizer_1 = require("./ImageOptimizer");
const VisionProviderRegistry_1 = require("./VisionProviderRegistry");
class ScreenUnderstandingService {
    imageHashService;
    optimizer;
    lastResult = null;
    STALE_THRESHOLD_MS = 5 * 60 * 1000;
    constructor(optimizer) {
        this.imageHashService = new ImageHashService_1.ImageHashService();
        this.optimizer = optimizer || (0, ImageOptimizer_1.getImageOptimizer)();
    }
    async understand(request) {
        const started = Date.now();
        const warnings = [];
        const mode = (request.screenUnderstandingMode || 'vision_first');
        const policy = request.providerPolicy || {};
        // Honor screenshots-scope gate up front — never even resolve paths if the user
        // disabled screenshots for the active provider.
        if (policy.allowScreenshots === false) {
            warnings.push('Screenshots disabled by provider data scope');
            return this.buildUnavailable({
                request,
                warnings,
                started,
                failureReason: 'scope_blocked',
                unavailableReason: 'Screenshots are disabled for the current provider. Enable the screenshots scope to attach screen context.',
            });
        }
        // Resolve image paths (capture if requested + missing).
        let imagePaths = request.imagePaths || (request.imagePath ? [request.imagePath] : []);
        if (request.captureIfMissing && imagePaths.length === 0) {
            try {
                imagePaths = [await this.captureScreenshot()];
            }
            catch (err) {
                warnings.push(`Screenshot capture failed: ${err?.message || 'unknown error'}`);
                return this.buildUnavailable({
                    request,
                    warnings,
                    started,
                    status: 'permission_missing',
                    unavailableReason: process.platform === 'darwin'
                        ? 'Could not capture the screen. Check Screen Recording permission in System Settings → Privacy & Security → Screen Recording.'
                        : 'Could not capture the screen. Check your display configuration and try again.',
                });
            }
        }
        // Validate paths.
        const userDataDir = (electron_1.app?.getPath ? electron_1.app.getPath('userData') : undefined) ||
            process.env.NATIVELY_TEST_USER_DATA ||
            '';
        const validPaths = [];
        for (const p of imagePaths) {
            const v = (0, curlUtils_1.validateImagePath)(p, userDataDir);
            if (!v.isValid) {
                warnings.push(`Invalid image path rejected: ${v.reason}`);
                continue;
            }
            validPaths.push(p);
        }
        if (validPaths.length === 0) {
            warnings.push('No valid image paths available');
            return this.buildUnavailable({ request, warnings, started });
        }
        // Hash for cache.
        let imageHash;
        try {
            imageHash = await this.imageHashService.computeHash(validPaths[validPaths.length - 1]);
        }
        catch {
            try {
                imageHash = await this.imageHashService.quickHash(validPaths[validPaths.length - 1]);
            }
            catch {
                imageHash = undefined;
            }
        }
        // Cache lookup — same image within 5 min → reuse.
        if (imageHash) {
            const cached = this.cacheLookup(imageHash);
            if (cached)
                return cached;
        }
        // Build the provider list per mode. Production callers inject this via
        // buildVisionProviders(); tests can substitute their own list via the
        // optional `request.providerPolicy.__providersOverride` hook (untyped to
        // keep the public contract clean).
        const providers = request.providerPolicy?.__providersOverride
            || (0, VisionProviderRegistry_1.buildVisionProviders)(this.collectBuildInputs(request, mode, policy));
        if (providers.length === 0) {
            warnings.push('No vision provider configured');
            return this.buildUnavailable({
                request,
                warnings,
                started,
                failureReason: 'no_vision_provider',
                imagePaths: validPaths,
                imageHash,
                unavailableReason: mode === 'private_vision'
                    ? 'No local vision provider is available. Configure Ollama with a vision-capable model (llava, qwen2.5-vl, llama3.2-vision, etc.) or enable Codex CLI vision.'
                    : 'No vision-capable provider is configured. Add an API key for OpenAI, Claude, Gemini, Groq, or Natively, or configure a local Ollama vision model.',
            });
        }
        // Pick optimization profile.
        const profile = this.pickOptimizationProfile(request);
        // System & user prompts come from the prompts module (Phase 6).
        const { systemPrompt, userPrompt, isTechnical } = await this.buildPrompts(request);
        // Run the chain.
        const latestPath = validPaths[validPaths.length - 1];
        const result = await (0, VisionProviderFallbackChain_1.runVisionFallback)({
            imagePath: latestPath,
            cacheKey: imageHash,
            mode,
            providers,
            systemPrompt,
            userPrompt,
            optimizer: this.optimizer,
            optimizationProfile: profile,
        });
        const out = this.assembleResult(result, {
            request,
            warnings,
            started,
            imagePaths: validPaths,
            imageHash,
            isTechnical,
        });
        this.lastResult = out;
        return out;
    }
    // ── helpers ────────────────────────────────────────────────────────────
    collectBuildInputs(request, mode, policy) {
        return {
            mode,
            localOnly: policy.localOnly === true || mode === 'private_vision',
            scopeAllowsScreenshots: policy.allowScreenshots !== false,
        };
    }
    pickOptimizationProfile(request) {
        if (request.qualityMode === 'fast')
            return 'fast';
        if (request.qualityMode === 'best')
            return 'best';
        if (this.isTechnicalMode(request.modeTemplateType) && request.technicalInterviewVisionFirst !== false) {
            return 'technical';
        }
        return 'balanced';
    }
    async buildPrompts(request) {
        const { buildVisionPrompts } = await Promise.resolve().then(() => __importStar(require('./visionPrompts')));
        return buildVisionPrompts(request);
    }
    async captureScreenshot() {
        const { ScreenshotHelper } = await Promise.resolve().then(() => __importStar(require('../../ScreenshotHelper')));
        const helper = new ScreenshotHelper();
        return helper.takeScreenshot();
    }
    cacheLookup(imageHash) {
        if (!this.lastResult || this.lastResult.imageHash !== imageHash)
            return null;
        const age = Date.now() - this.lastResult.capturedAt;
        if (age < this.STALE_THRESHOLD_MS)
            return { ...this.lastResult };
        return null;
    }
    isTechnicalMode(modeTemplateType) {
        if (!modeTemplateType)
            return false;
        const technical = ['technical-interview', 'coding', 'debug', 'code-review'];
        return technical.some(m => modeTemplateType.toLowerCase().includes(m));
    }
    classifyScreenType(text, transcript) {
        const combined = `${text} ${transcript || ''}`.toLowerCase();
        if (/\b(function|const|let|var|import|return|class|def|public|private|void)\b/.test(combined) && /[{}\[\];]/.test(combined))
            return 'code';
        if (/\b(error|exception|failed|cannot|undefined|null pointer|stack trace)\b/i.test(combined))
            return 'error';
        if (/\|.*\|.*\|/.test(text) || /\btable\b.*\brow\b/i.test(combined))
            return 'table';
        if (/\b(chart|graph|dashboard|metrics|percent|increase|decrease)\b/i.test(combined))
            return 'chart';
        if (/\b(slide|presentation|powerpoint|keynote)\b/i.test(combined))
            return 'slide';
        if (/\b(document|article|paper|paragraph|section)\b/i.test(combined))
            return 'document';
        if (/\b(button|menu|dialog|window|checkbox|radio|dropdown)\b/i.test(combined))
            return 'ui';
        return 'unknown';
    }
    detectTask(text, transcript) {
        const combined = `${text} ${transcript || ''}`;
        if (/\b(two sum|leetcode|algorithm|coding problem)\b/i.test(combined))
            return 'coding_interview';
        if (/\b(sales|pricing|quote|discount)\b/i.test(combined))
            return 'sales_interaction';
        if (/\b(lecture|teaching|course|lesson)\b/i.test(combined))
            return 'lecture_note';
        return undefined;
    }
    // Lightweight structured extraction from the model's text output.
    // If the model returned JSON (structured-extract path), parse it.
    // Otherwise treat the output as `visibleSummary` and run regex extractors.
    extractStructured(rawOutput) {
        const trimmed = rawOutput.trim();
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
                const parsed = JSON.parse(trimmed);
                return {
                    visibleSummary: typeof parsed.visibleSummary === 'string' ? parsed.visibleSummary : '',
                    extractedText: typeof parsed.extractedText === 'string' ? parsed.extractedText : (typeof parsed.visibleSummary === 'string' ? parsed.visibleSummary : ''),
                    codeBlocks: Array.isArray(parsed.codeBlocks) ? parsed.codeBlocks.filter((c) => typeof c === 'string') : this.extractCodeBlocks(trimmed),
                    tables: Array.isArray(parsed.tables) ? parsed.tables : [],
                    errors: Array.isArray(parsed.errors) ? parsed.errors.filter((e) => typeof e === 'string') : [],
                    screenType: typeof parsed.screenType === 'string' ? parsed.screenType : undefined,
                    taskDetected: typeof parsed.taskDetected === 'string' ? parsed.taskDetected : undefined,
                    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : undefined,
                };
            }
            catch {
                // fall through to plain-text path
            }
        }
        return {
            visibleSummary: trimmed.length > 600 ? trimmed.substring(0, 600) + '...' : trimmed,
            extractedText: trimmed,
            codeBlocks: this.extractCodeBlocks(trimmed),
            tables: [],
            errors: this.extractErrors(trimmed),
        };
    }
    extractCodeBlocks(text) {
        const blocks = [];
        const fence = /```[\w]*\n([\s\S]*?)\n```/g;
        let m;
        while ((m = fence.exec(text))) {
            if (m[1] && m[1].trim())
                blocks.push(m[1].trim());
        }
        return blocks;
    }
    extractErrors(text) {
        const errors = [];
        for (const line of text.split('\n')) {
            if (/\b(error|exception|failed|cannot|undefined|null pointer|stack trace|at\s+\w+\.\w+)\b/i.test(line)) {
                errors.push(line.trim());
            }
        }
        return errors.slice(0, 10);
    }
    assembleResult(fallback, ctx) {
        const now = Date.now();
        if (!fallback.ok) {
            const unavailableReason = fallback.failureReason === 'privacy_blocked'
                ? 'Private mode blocked all cloud vision providers and no local vision provider is configured.'
                : fallback.failureReason === 'scope_blocked'
                    ? 'Screenshots are disabled for the active provider.'
                    : fallback.failureReason === 'no_vision_provider'
                        ? 'No vision-capable provider is configured.'
                        : 'All configured vision providers failed.';
            return {
                status: 'failed',
                source: 'unavailable',
                screenType: 'unknown',
                attempts: fallback.attempts,
                confidence: 0,
                imagePaths: ctx.imagePaths,
                imageHash: ctx.imageHash,
                capturedAt: now,
                durationMs: now - ctx.started,
                warnings: ctx.warnings,
                failureReason: fallback.failureReason,
                unavailableReason,
                source_kind: 'vision',
            };
        }
        const structured = this.extractStructured(fallback.outputText || '');
        const screenType = structured.screenType
            || this.classifyScreenType(structured.extractedText || structured.visibleSummary, ctx.request.transcript);
        const taskDetected = structured.taskDetected || this.detectTask(structured.extractedText || structured.visibleSummary, ctx.request.transcript);
        // Technical interview / code hint / debug → mark as vision_direct (final answer).
        // Otherwise extraction path → vision_extract.
        const source = ctx.isTechnical || ctx.request.userAction === 'code_hint' || ctx.request.userAction === 'brainstorm'
            ? 'vision_direct'
            : 'vision_extract';
        const visibleSummary = structured.visibleSummary || structured.extractedText;
        const extractedText = structured.extractedText || visibleSummary;
        return {
            status: 'available',
            source,
            screenType,
            providerUsed: fallback.providerUsed,
            modelUsed: fallback.modelUsed,
            attempts: fallback.attempts,
            visibleSummary,
            extractedText,
            codeBlocks: structured.codeBlocks,
            tables: structured.tables,
            errors: structured.errors,
            taskDetected,
            confidence: structured.confidence ?? 0.85,
            imagePaths: ctx.imagePaths,
            imageHash: ctx.imageHash,
            capturedAt: now,
            durationMs: now - ctx.started,
            warnings: ctx.warnings,
            // PromptAssembler-compat fields:
            ocrText: extractedText, // legacy key, populated by vision
            imagePath: ctx.imagePaths[ctx.imagePaths.length - 1],
            hash: ctx.imageHash,
            timestamp: now,
            source_kind: 'vision',
        };
    }
    buildUnavailable(opts) {
        const now = Date.now();
        return {
            status: opts.status || 'unavailable',
            source: 'unavailable',
            screenType: 'unknown',
            attempts: [],
            confidence: 0,
            imagePaths: opts.imagePaths || [],
            imageHash: opts.imageHash,
            capturedAt: now,
            durationMs: now - opts.started,
            warnings: opts.warnings,
            failureReason: opts.failureReason,
            unavailableReason: opts.unavailableReason,
            source_kind: 'vision',
        };
    }
    getLastResult() {
        return this.lastResult;
    }
}
exports.ScreenUnderstandingService = ScreenUnderstandingService;
let singleton = null;
function getScreenUnderstandingService() {
    if (!singleton)
        singleton = new ScreenUnderstandingService();
    return singleton;
}
//# sourceMappingURL=ScreenUnderstandingService.js.map
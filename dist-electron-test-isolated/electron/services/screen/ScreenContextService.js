"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScreenContextService = void 0;
const ImageHashService_1 = require("./ImageHashService");
const ScreenshotHelper_1 = require("../../ScreenshotHelper");
const OcrProviderManager_1 = require("./OcrProviderManager");
// OCR is expensive, so we cache results by image hash
// Use change detection: if screenshot hash unchanged, reuse screen context
class ScreenContextService {
    imageHashService;
    ocrCache;
    screenshotHelper = null;
    ocrProviderManager = null;
    CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
    constructor() {
        this.imageHashService = new ImageHashService_1.ImageHashService();
        this.ocrCache = new Map();
    }
    /**
     * Get the OCR provider manager (lazy initialization).
     */
    getOcrManager() {
        if (!this.ocrProviderManager) {
            this.ocrProviderManager = (0, OcrProviderManager_1.getOcrProviderManager)();
        }
        return this.ocrProviderManager;
    }
    /**
     * Initialize the screenshot helper (delayed to avoid circular deps)
     */
    getScreenshotHelper() {
        if (!this.screenshotHelper) {
            this.screenshotHelper = new ScreenshotHelper_1.ScreenshotHelper();
        }
        return this.screenshotHelper;
    }
    /**
     * Capture a screenshot, run OCR, and return screen context.
     * Convenience method that combines screenshot capture + OCR extraction.
     */
    async captureScreen() {
        const screenshotPath = await this.getScreenshotHelper().takeScreenshot();
        return this.captureScreenFromPath(screenshotPath);
    }
    /**
     * Capture a cropper screenshot, run OCR, and return screen context.
     */
    async captureCropper(captureArea) {
        const screenshotPath = await this.getScreenshotHelper().takeSelectiveScreenshot(captureArea);
        return this.captureScreenFromPath(screenshotPath);
    }
    /**
     * Process an existing screenshot file and extract OCR context.
     */
    async captureScreenFromPath(screenshotPath) {
        const timestamp = Date.now();
        // Compute perceptual hash for dedupe
        let hash;
        try {
            hash = await this.imageHashService.computeHash(screenshotPath);
        }
        catch (error) {
            console.warn('[ScreenContextService] Failed to compute perceptual hash, using quick hash:', error);
            hash = await this.imageHashService.quickHash(screenshotPath);
        }
        // Check cache first
        const cached = this.ocrCache.get(hash);
        if (cached && (timestamp - cached.createdAt) < this.CACHE_TTL_MS) {
            console.log('[ScreenContextService] Cache hit for hash:', hash);
            return {
                ...cached.context,
                timestamp // Update timestamp to show when it was last used
            };
        }
        // Run OCR using the provider manager (supports fallback chain)
        let ocrText = '';
        let confidence = 0;
        let provider = 'tesseract';
        try {
            const ocrManager = this.getOcrManager();
            const result = await ocrManager.recognize(screenshotPath, { timeoutMs: 8_000, maxDimension: 1200 });
            ocrText = result.text;
            confidence = result.confidence;
            provider = result.provider;
        }
        catch (error) {
            console.error('[ScreenContextService] OCR failed:', error);
            // Graceful fallback: return empty OCR text, not an error
            ocrText = '';
            confidence = 0;
        }
        const context = {
            ocrText,
            imagePath: screenshotPath,
            timestamp,
            hash,
            confidence,
            provider,
        };
        // Cache the result
        this.ocrCache.set(hash, {
            context,
            createdAt: timestamp
        });
        // Cleanup old cache entries
        this.cleanupCache();
        return context;
    }
    /**
     * Run OCR on an image using the provider manager's fallback chain.
     * This method is kept for backward compatibility but delegates to OcrProviderManager.
     */
    async runOCR(imagePath) {
        try {
            const ocrManager = this.getOcrManager();
            const result = await ocrManager.recognize(imagePath, { timeoutMs: 8_000, maxDimension: 1200 });
            return result.text;
        }
        catch (error) {
            console.error('[ScreenContextService] runOCR failed:', error);
            return '';
        }
    }
    /**
     * Cleanup expired cache entries
     */
    cleanupCache() {
        const now = Date.now();
        for (const [hash, entry] of this.ocrCache.entries()) {
            if (now - entry.createdAt > this.CACHE_TTL_MS) {
                this.ocrCache.delete(hash);
            }
        }
    }
    /**
     * Clear the OCR cache
     */
    clearCache() {
        this.ocrCache.clear();
    }
    /**
     * Get cache stats for monitoring
     */
    getCacheStats() {
        return {
            size: this.ocrCache.size,
            entries: Array.from(this.ocrCache.keys()),
            provider: this.ocrProviderManager?.getPrimaryProviderType() || 'unknown',
        };
    }
}
exports.ScreenContextService = ScreenContextService;
//# sourceMappingURL=ScreenContextService.js.map
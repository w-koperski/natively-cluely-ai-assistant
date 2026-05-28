"use strict";
// electron/services/screen/OcrProvider.ts
//
// LEGACY OCR PATH — RUNTIME-DISABLED (2026-05-17)
// =====================================================================
// Natively now uses vision-provider screen understanding by default.
// This module is retained for two reasons:
//   1. Existing tests still verify the OCR interface contract.
//   2. A future explicit OCR-only mode could be reintroduced by toggling
//      the runtime gate in ScreenUnderstandingService.
// Do NOT call this module from any new runtime path. The default screen
// flow must route through VisionProviderFallbackChain.
// =====================================================================
//
// Original purpose:
// Unified OCR provider interface for Natively.
// Supports: macOS Apple Vision, Windows OCR, RapidOCR, Tesseract.js
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OCR_PROVIDERS = exports.RapidOcrAdapter = exports.WindowsOcrAdapter = exports.AppleVisionOcrAdapter = exports.TesseractOcrAdapter = void 0;
const node_module_1 = require("node:module");
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const sharp_1 = __importDefault(require("sharp"));
const uuid_1 = require("uuid");
const requireFromBundle = (0, node_module_1.createRequire)(__filename);
function getTesseractAssetPaths() {
    const workerPath = requireFromBundle.resolve('tesseract.js/src/worker-script/node/index.js');
    const corePath = node_path_1.default.dirname(requireFromBundle.resolve('tesseract.js-core'));
    return { workerPath, corePath };
}
async function prepareImageForOcr(imagePath, maxDimension = 1600) {
    const metadata = await (0, sharp_1.default)(imagePath).metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;
    if (width <= maxDimension && height <= maxDimension) {
        return { path: imagePath };
    }
    const tempPath = node_path_1.default.join(node_os_1.default.tmpdir(), `natively-ocr-${(0, uuid_1.v4)()}.png`);
    await (0, sharp_1.default)(imagePath)
        .resize({ width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true })
        .grayscale()
        .normalize()
        .png({ compressionLevel: 6 })
        .toFile(tempPath);
    return {
        path: tempPath,
        cleanup: async () => {
            try {
                await node_fs_1.default.promises.unlink(tempPath);
            }
            catch {
                // Best-effort cleanup
            }
        },
    };
}
// Tesseract OCR adapter — primary fallback
class TesseractOcrAdapter {
    type = 'tesseract';
    name = 'Tesseract.js';
    isAvailable() {
        // Tesseract.js is always available via npm
        return true;
    }
    async recognize(imagePath, options) {
        const startTime = Date.now();
        const prepared = await prepareImageForOcr(imagePath, options?.maxDimension);
        try {
            const Tesseract = await Promise.resolve().then(() => __importStar(require('tesseract.js')));
            const assetPaths = getTesseractAssetPaths();
            const result = await Tesseract.recognize(prepared.path, options?.languages?.[0] || 'eng', {
                ...assetPaths,
                logger: (m) => {
                    if (process.env.NATIVELY_OCR_DEBUG === '1' && m.status === 'recognizing text') {
                        console.log(`[TesseractOCR] progress: ${Math.round(m.progress * 100)}%`);
                    }
                },
            });
            const durationMs = Date.now() - startTime;
            return {
                text: result.data.text.trim(),
                lines: result.data.lines?.map((line) => ({
                    text: line.text,
                    confidence: line.confidence,
                    bbox: line.bbox,
                })) || [],
                confidence: result.data.confidence / 100, // Tesseract returns 0-100
                provider: this.name,
                durationMs,
            };
        }
        catch (error) {
            console.error('[TesseractOCR] recognition failed:', error?.message || error);
            throw new Error(`Tesseract OCR failed: ${error?.message || 'unknown error'}`);
        }
        finally {
            await prepared.cleanup?.();
        }
    }
    async recognizeBuffer(buffer, options) {
        const tempPath = node_path_1.default.join(node_os_1.default.tmpdir(), `ocr-${(0, uuid_1.v4)()}.png`);
        await node_fs_1.default.promises.writeFile(tempPath, buffer);
        try {
            return await this.recognize(tempPath, options);
        }
        finally {
            try {
                await node_fs_1.default.promises.unlink(tempPath);
            }
            catch {
                // Best-effort cleanup
            }
        }
    }
}
exports.TesseractOcrAdapter = TesseractOcrAdapter;
// Apple Vision OCR adapter — macOS native
// TODO: Implement when native macOS OCR bridge is available
class AppleVisionOcrAdapter {
    type = 'apple_vision';
    name = 'Apple Vision OCR';
    isAvailable() {
        // Only available on macOS
        if (process.platform !== 'darwin') {
            return false;
        }
        // TODO: Check for Vision framework availability
        return false; // Stub until native bridge is implemented
    }
    async recognize(imagePath, options) {
        throw new Error('Apple Vision OCR not yet implemented. Use Tesseract.js fallback.');
    }
    async recognizeBuffer(buffer, options) {
        throw new Error('Apple Vision OCR not yet implemented. Use Tesseract.js fallback.');
    }
}
exports.AppleVisionOcrAdapter = AppleVisionOcrAdapter;
// Windows OCR adapter — Windows native
// TODO: Implement when native Windows OCR bridge is available
class WindowsOcrAdapter {
    type = 'windows_ocr';
    name = 'Windows OCR';
    isAvailable() {
        // Only available on Windows
        if (process.platform !== 'win32') {
            return false;
        }
        // TODO: Check for Windows OCR availability
        return false; // Stub until native bridge is implemented
    }
    async recognize(imagePath, options) {
        throw new Error('Windows OCR not yet implemented. Use Tesseract.js fallback.');
    }
    async recognizeBuffer(buffer, options) {
        throw new Error('Windows OCR not yet implemented. Use Tesseract.js fallback.');
    }
}
exports.WindowsOcrAdapter = WindowsOcrAdapter;
// RapidOCR adapter
// TODO: Implement when RapidOCR sidecar is configured
class RapidOcrAdapter {
    type = 'rapidocr';
    name = 'RapidOCR';
    isAvailable() {
        // TODO: Check for RapidOCR sidecar process
        return false; // Stub until RapidOCR sidecar is implemented
    }
    async recognize(imagePath, options) {
        throw new Error('RapidOCR not yet configured. Use Tesseract.js fallback.');
    }
    async recognizeBuffer(buffer, options) {
        throw new Error('RapidOCR not yet configured. Use Tesseract.js fallback.');
    }
}
exports.RapidOcrAdapter = RapidOcrAdapter;
// Provider registry for easy lookup
exports.OCR_PROVIDERS = {
    apple_vision: new AppleVisionOcrAdapter(),
    windows_ocr: new WindowsOcrAdapter(),
    rapidocr: new RapidOcrAdapter(),
    tesseract: new TesseractOcrAdapter(),
    unavailable: {
        type: 'unavailable',
        name: 'Unavailable',
        isAvailable: () => false,
        recognize: async () => { throw new Error('No OCR provider available'); },
        recognizeBuffer: async () => { throw new Error('No OCR provider available'); },
    },
};
//# sourceMappingURL=OcrProvider.js.map
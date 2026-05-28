"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageHashService = void 0;
const fs_1 = __importDefault(require("fs"));
const crypto_1 = __importDefault(require("crypto"));
const sharp_1 = __importDefault(require("sharp"));
/**
 * Computes perceptual hash of an image for change detection.
 * Uses sharp to resize to 16x16 grayscale, then computes average hash.
 */
class ImageHashService {
    /**
     * Compute perceptual hash (pHash) of an image.
     * Resizes to 16x16 grayscale and computes a hash based on pixel values.
     * Two visually identical images will have the same or very similar hash.
     */
    async computeHash(imagePath) {
        try {
            const buffer = await fs_1.default.promises.readFile(imagePath);
            // Resize to 16x16 grayscale for perceptual hash
            const { data, info } = await (0, sharp_1.default)(buffer)
                .resize(16, 16, { fit: 'fill' })
                .grayscale()
                .raw()
                .toBuffer({ resolveWithObject: true });
            // Compute perceptual hash using average hash algorithm
            // Compare each pixel to the average of all pixels
            const pixels = new Uint8Array(data);
            const avg = pixels.reduce((a, b) => a + b, 0) / pixels.length;
            let hash = '';
            for (const pixel of pixels) {
                hash += pixel >= avg ? '1' : '0';
            }
            // Convert binary string to hex for readability
            const hashBuffer = Buffer.from(hash, 'binary');
            return hashBuffer.toString('hex');
        }
        catch (error) {
            console.error('[ImageHashService] computeHash failed:', error);
            throw new Error(`Failed to compute image hash: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Quick file hash using MD5 of first 8KB + file size.
     * Fast but not perceptually meaningful - used for quick dedupe checks.
     */
    async quickHash(imagePath) {
        try {
            const fileHandle = await fs_1.default.promises.open(imagePath, 'r');
            const stats = await fileHandle.stat();
            const fileSize = stats.size;
            // Read first 8KB for quick hash
            const firstChunk = Buffer.alloc(8192);
            await fileHandle.read(firstChunk, 0, 8192, 0);
            await fileHandle.close();
            // Combine first chunk hash with file size for uniqueness
            const hash = crypto_1.default.createHash('md5');
            hash.update(firstChunk);
            hash.update(fileSize.toString());
            return hash.digest('hex');
        }
        catch (error) {
            console.error('[ImageHashService] quickHash failed:', error);
            throw new Error(`Failed to compute quick hash: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
exports.ImageHashService = ImageHashService;
//# sourceMappingURL=ImageHashService.js.map
"use strict";
/**
 * Resolves the on-disk path to whisperWorker.js across two build layouts:
 *
 *   - Unbundled (tsc → dist-electron):
 *       this module compiles to dist-electron/electron/audio/whisper/workerPathResolver.js
 *       __dirname = dist-electron/electron/audio/whisper/
 *       worker is a sibling → whisperWorker.js
 *
 *   - Bundled (esbuild `bundle: true` inlines into main.js):
 *       this module is folded into dist-electron/electron/main.js
 *       __dirname = dist-electron/electron/
 *       worker stays at its source-mirrored location → audio/whisper/whisperWorker.js
 *
 * Because this resolver is itself bundled alongside its callers, its own
 * __dirname tracks the bundling state — so callers don't need to pass anything.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findFirstExistingPath = findFirstExistingPath;
exports.resolveWhisperWorkerPath = resolveWhisperWorkerPath;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
function findFirstExistingPath(candidates, exists = fs_1.default.existsSync) {
    return candidates.find(p => exists(p)) ?? candidates[0];
}
function resolveWhisperWorkerPath() {
    return findFirstExistingPath([
        path_1.default.join(__dirname, 'whisperWorker.js'),
        path_1.default.join(__dirname, 'audio', 'whisper', 'whisperWorker.js'),
    ]);
}
//# sourceMappingURL=workerPathResolver.js.map
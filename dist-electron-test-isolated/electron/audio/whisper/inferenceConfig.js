"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildWorkerInitMessage = buildWorkerInitMessage;
exports.resolveInferenceConfig = resolveInferenceConfig;
/**
 * Whisper-safe per-module dtype map. Applies to Whisper, Distil-Whisper, and
 * Moonshine — all three use the same encoder/decoder ONNX file naming.
 *
 *   encoder_model            → fp32  (preserves acoustic encoder accuracy)
 *   decoder_model            → q8    (token decoder; quantizing here is the
 *   decoder_model_merged     → q8     standard speedup with negligible WER cost)
 *   decoder_with_past_model  → q8
 *
 * The Record acts as a SUPERSET — keys that don't match any of the loaded
 * model's actual ONNX files are silently ignored by the loader, so a single
 * map can serve all three model families (Whisper uses merged decoder,
 * Moonshine uses separate decoder + with_past, etc.).
 */
const WHISPER_SAFE_DTYPE = {
    encoder_model: 'fp32',
    decoder_model: 'q8',
    decoder_model_merged: 'q8',
    decoder_with_past_model: 'q8',
};
/**
 * Construct the worker `init` message for a given model. Single source of
 * truth — three callers (LocalWhisperSTT.spawnWorker, modelPreloader.preload,
 * local-whisper-start-download IPC) all use this so the message shape stays
 * consistent. The cacheDir lookup is lazy (avoids importing electron from
 * this leaf module).
 */
function buildWorkerInitMessage(modelId) {
    // Late require — modelManager imports electron, which isn't available
    // when this module is first loaded in some contexts (test harnesses).
    const { getModelsDir } = require('./modelManager');
    const { executionProviders, dtype } = resolveInferenceConfig();
    return {
        type: 'init',
        modelId,
        cacheDir: getModelsDir(),
        executionProviders,
        dtype,
    };
}
function resolveInferenceConfig() {
    const { platform, arch } = process;
    if (platform === 'darwin' && arch === 'arm64') {
        // Apple Silicon — CoreML uses Metal GPU + ANE. Feed it fp32 ONNX
        // and let CoreML re-quantize internally; it's tuned for this path.
        return { executionProviders: ['coreml', 'cpu'], dtype: 'fp32' };
    }
    if (platform === 'win32') {
        // Windows — DirectML over NVIDIA / AMD / Intel GPUs. Per-module dtype
        // gives best accuracy/speed tradeoff for the larger Whisper/Distil
        // checkpoints; DirectML handles mixed precision via session options.
        return { executionProviders: ['dml', 'cpu'], dtype: WHISPER_SAFE_DTYPE };
    }
    // Intel Mac, Linux, unknown — CPU. Per-module gives a real speedup on
    // decoder-heavy inference without sacrificing encoder accuracy.
    return { executionProviders: ['cpu'], dtype: WHISPER_SAFE_DTYPE };
}
//# sourceMappingURL=inferenceConfig.js.map
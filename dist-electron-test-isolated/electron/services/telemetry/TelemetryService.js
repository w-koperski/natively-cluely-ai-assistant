"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.telemetryService = exports.TelemetryService = void 0;
exports.sanitizeTelemetryProperties = sanitizeTelemetryProperties;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const DEFAULT_FILE_NAME = 'telemetry.jsonl';
const REDACTED = '[REDACTED]';
const REMOVED = '[REMOVED]';
// Sensitive-key match: any property whose name ends with one of these tokens
// is REDACTED. The list intentionally includes everything that has ever
// carried verbatim user content (queries, chunks, transcripts, prompts,
// error bodies, free-form error messages). Add to this list when introducing
// any new free-text property — telemetry should never carry raw user input.
const SENSITIVE_KEY_RE = /(api[_-]?key|authorization|bearer|token|secret|password|credential|raw[_-]?(transcript|prompt|reference|content|query)|transcript(text)?|prompt|reference(content)?|evidence(text)?|screenshot(path)?|image(path)?|error(body|response|message)?|responsebody|body|query(text|string)?|user(input|message)|chunk(text|content)?|snippet(text)?)$/i;
// REMOVE_VALUE_KEY_RE matches a strict subset of the above for which we drop
// the value entirely (not just redact). Used for keys that are guaranteed-
// bulky raw text — we don't want a 16KB transcript field in a log line even
// with [REDACTED] in place.
const REMOVE_VALUE_KEY_RE = /(raw[_-]?(transcript|prompt|reference|content|query)|transcript(text)?|prompt|reference(content)?|evidence(text)?|screenshot(path)?|image(path)?|error(body|response)?|responsebody|body|query(text|string)?|user(input|message)|chunk(text|content)?|snippet(text)?)$/i;
const API_KEY_VALUE_PATTERNS = [
    /Bearer\s+[A-Za-z0-9._~+\/=:-]{12,}/gi,
    /natively_sk_[A-Za-z0-9._-]+/gi,
    /sk-[A-Za-z0-9]{20,}/gi,
    /gsk_[A-Za-z0-9]{20,}/gi,
    /dg_[A-Za-z0-9]{20,}/gi,
    /[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,}/g,
];
class TelemetryService {
    enabled;
    localEnabled;
    logFilePath;
    sinks;
    constructor(config = {}) {
        this.enabled = config.enabled !== false;
        this.localEnabled = config.localEnabled !== false;
        this.sinks = config.sinks ?? [];
        this.logFilePath = config.logFilePath ?? path_1.default.join(config.userDataPath ?? process.cwd(), 'logs', DEFAULT_FILE_NAME);
    }
    /**
     * Phase 6 — runtime reconfiguration so the shared singleton can switch from
     * a process.cwd()-relative log path to the real Electron userData path once
     * the app is ready. Settings changes (enable/disable telemetry) also flow
     * through here. Never mutates the in-memory log buffer — old events stay
     * where they were written.
     */
    configure(config) {
        if (typeof config.enabled === 'boolean')
            this.enabled = config.enabled;
        if (typeof config.localEnabled === 'boolean')
            this.localEnabled = config.localEnabled;
        if (Array.isArray(config.sinks))
            this.sinks = config.sinks;
        if (config.logFilePath) {
            this.logFilePath = config.logFilePath;
        }
        else if (config.userDataPath) {
            this.logFilePath = path_1.default.join(config.userDataPath, 'logs', DEFAULT_FILE_NAME);
        }
    }
    isEnabled() {
        return this.enabled;
    }
    getLogFilePath() {
        return this.logFilePath;
    }
    track(input) {
        if (!this.enabled)
            return;
        const record = {
            name: String(input.name),
            timestamp: new Date().toISOString(),
            properties: sanitizeTelemetryProperties(input.properties ?? {}),
        };
        if (input.sessionId)
            record.sessionId = String(input.sessionId);
        if (input.modeId)
            record.modeId = String(input.modeId);
        if (input.provider)
            record.provider = String(input.provider);
        if (typeof input.durationMs === 'number' && Number.isFinite(input.durationMs))
            record.durationMs = input.durationMs;
        if (input.status)
            record.status = String(input.status);
        if (this.localEnabled) {
            this.appendLocal(record);
        }
        for (const sink of this.sinks) {
            if (!sink.enabled || sink.name === 'local-jsonl')
                continue;
            // Placeholder for future SDK-backed sinks. Intentionally no-op to avoid dependencies
            // and to preserve local-only default telemetry behavior.
        }
    }
    appendLocal(record) {
        try {
            fs_1.default.mkdirSync(path_1.default.dirname(this.logFilePath), { recursive: true });
            fs_1.default.appendFileSync(this.logFilePath, `${JSON.stringify(record)}\n`, 'utf8');
        }
        catch (error) {
            // Telemetry must never break app behavior.
        }
    }
}
exports.TelemetryService = TelemetryService;
function sanitizeTelemetryProperties(properties) {
    return sanitizeObject(properties, new WeakSet());
}
function sanitizeObject(value, seen) {
    if (value === null || value === undefined)
        return value;
    if (typeof value === 'string')
        return redactString(value);
    if (typeof value === 'number' || typeof value === 'boolean')
        return Number.isNaN(value) ? null : value;
    if (typeof value === 'bigint')
        return value.toString();
    if (typeof value === 'function' || typeof value === 'symbol')
        return undefined;
    if (Array.isArray(value)) {
        if (seen.has(value))
            return '[Circular]';
        seen.add(value);
        return value.map(item => sanitizeObject(item, seen)).filter(item => item !== undefined);
    }
    if (typeof value === 'object') {
        if (seen.has(value))
            return '[Circular]';
        seen.add(value);
        const output = {};
        for (const [key, child] of Object.entries(value)) {
            if (REMOVE_VALUE_KEY_RE.test(key)) {
                output[key] = REMOVED;
            }
            else if (SENSITIVE_KEY_RE.test(key)) {
                output[key] = REDACTED;
            }
            else {
                const sanitized = sanitizeObject(child, seen);
                if (sanitized !== undefined)
                    output[key] = sanitized;
            }
        }
        return output;
    }
    return undefined;
}
function redactString(value) {
    let redacted = value;
    for (const pattern of API_KEY_VALUE_PATTERNS) {
        redacted = redacted.replace(pattern, REDACTED);
    }
    return redacted;
}
exports.telemetryService = new TelemetryService();
//# sourceMappingURL=TelemetryService.js.map
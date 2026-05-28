"use strict";
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
exports.CodexCliService = exports.DEFAULT_CODEX_CLI_CONFIG = exports.CODEX_SANDBOX_MODES = void 0;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
exports.CODEX_SANDBOX_MODES = ['read-only', 'workspace-write', 'danger-full-access'];
// Default fast model: gpt-5.3-codex works with both ChatGPT-account and API-key
// auth. The faster gpt-5.3-codex-spark is API-key-only and 400s on ChatGPT auth.
exports.DEFAULT_CODEX_CLI_CONFIG = {
    enabled: false,
    path: 'codex',
    model: 'gpt-5.4',
    fastModel: 'gpt-5.3-codex',
    timeoutMs: 60_000,
    sandboxMode: 'read-only',
};
class CodexCliService {
    static buildArgs(model, imagePaths = [], sandboxMode = 'read-only') {
        const args = [
            'exec',
            '--json',
            '--color',
            'never',
            '--sandbox',
            sandboxMode,
            '--skip-git-repo-check',
            '--model',
            model,
        ];
        for (const imagePath of imagePaths) {
            if (!imagePath)
                continue;
            args.push('--image', imagePath);
        }
        return args;
    }
    static normalizeConfig(config = {}) {
        const timeoutMs = Number(config.timeoutMs);
        const sandboxMode = (config.sandboxMode && exports.CODEX_SANDBOX_MODES.includes(config.sandboxMode))
            ? config.sandboxMode
            : exports.DEFAULT_CODEX_CLI_CONFIG.sandboxMode;
        return {
            enabled: !!config.enabled,
            path: (config.path || exports.DEFAULT_CODEX_CLI_CONFIG.path).trim() || exports.DEFAULT_CODEX_CLI_CONFIG.path,
            model: (config.model || exports.DEFAULT_CODEX_CLI_CONFIG.model).trim() || exports.DEFAULT_CODEX_CLI_CONFIG.model,
            fastModel: (config.fastModel || exports.DEFAULT_CODEX_CLI_CONFIG.fastModel).trim() || exports.DEFAULT_CODEX_CLI_CONFIG.fastModel,
            timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : exports.DEFAULT_CODEX_CLI_CONFIG.timeoutMs,
            sandboxMode,
        };
    }
    // Common install locations checked when the configured path doesn't resolve.
    // Order matters: explicit installs (npm/brew/cargo) outrank app-bundled CLIs
    // because the latter ship inside an app the user may not realize is "Codex".
    static getCandidatePaths() {
        const home = os.homedir();
        if (process.platform === 'win32') {
            const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
            const programs = process.env['ProgramFiles'] || 'C:\\Program Files';
            return [
                path.join(local, 'Programs', 'Codex', 'codex.exe'),
                path.join(programs, 'Codex', 'codex.exe'),
                path.join(home, '.cargo', 'bin', 'codex.exe'),
                path.join(home, 'AppData', 'Roaming', 'npm', 'codex.cmd'),
            ];
        }
        return [
            '/opt/homebrew/bin/codex',
            '/usr/local/bin/codex',
            path.join(home, '.cargo', 'bin', 'codex'),
            path.join(home, '.local', 'bin', 'codex'),
            path.join(home, '.bun', 'bin', 'codex'),
            // Codex desktop app bundles the CLI inside Resources/.
            '/Applications/Codex.app/Contents/Resources/codex',
            path.join(home, 'Applications', 'Codex.app', 'Contents', 'Resources', 'codex'),
        ];
    }
    // Returns the first candidate that exists on disk and is executable.
    // Does NOT shell out — purely a filesystem check, safe to call frequently.
    static autoDetectPath() {
        for (const candidate of this.getCandidatePaths()) {
            try {
                const stat = fs.statSync(candidate);
                if (stat.isFile()) {
                    // On POSIX, also check exec bit; on Windows, presence is enough.
                    if (process.platform === 'win32')
                        return candidate;
                    // eslint-disable-next-line no-bitwise
                    if ((stat.mode & 0o111) !== 0)
                        return candidate;
                }
            }
            catch { /* not present, continue */ }
        }
        return null;
    }
    // Validate the given path; if it ENOENTs and looks bare (no path separator,
    // i.e. depends on $PATH), fall back to auto-detection and validate that.
    // Returns the resolved path on success so callers can persist it.
    static async validateExecutable(input, timeoutMs = 10_000) {
        const tryOne = (binPath) => new Promise((resolve) => {
            const child = (0, child_process_1.spawn)(binPath, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
            let stderr = '';
            const timer = setTimeout(() => {
                child.kill('SIGTERM');
                resolve({ success: false, error: `Codex CLI validation timed out for "${binPath}".` });
            }, timeoutMs);
            child.stderr.on('data', chunk => { stderr += chunk.toString(); });
            child.on('error', error => {
                clearTimeout(timer);
                resolve({ success: false, error: `Codex CLI was not found at "${binPath}". ${error.message}` });
            });
            child.on('close', code => {
                clearTimeout(timer);
                if (code === 0)
                    resolve({ success: true });
                else
                    resolve({ success: false, error: `Codex CLI validation failed for "${binPath}"${stderr ? `: ${this.sanitize(stderr)}` : '.'}` });
            });
        });
        const first = await tryOne(input);
        if (first.success)
            return { success: true, resolvedPath: input };
        // Bare command (relies on $PATH) or empty — try filesystem auto-detection.
        const looksBare = !input || !input.includes(path.sep);
        if (looksBare) {
            const detected = this.autoDetectPath();
            if (detected && detected !== input) {
                const second = await tryOne(detected);
                if (second.success)
                    return { success: true, resolvedPath: detected };
            }
        }
        return { success: false, error: first.error };
    }
    static async run(path, options) {
        const result = await this.collect(path, options);
        const normalized = this.extractText(result.stdout);
        if (normalized)
            return normalized;
        const codexError = this.extractCodexError(result.stdout);
        throw new Error(codexError || result.stderr || 'Codex CLI returned an empty response.');
    }
    static async *stream(path, options) {
        if (options.signal?.aborted)
            throw new Error('Codex CLI request aborted before start.');
        const args = this.buildArgs(options.model, options.imagePaths, options.sandboxMode);
        const child = (0, child_process_1.spawn)(path, args, { stdio: ['pipe', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        let lineBuffer = '';
        let emitted = false;
        let aborted = false;
        const timer = setTimeout(() => child.kill('SIGTERM'), options.timeoutMs);
        const queue = [];
        let finished = false;
        let failure = null;
        let notify = null;
        const wake = () => {
            if (notify) {
                notify();
                notify = null;
            }
        };
        const onAbort = () => {
            aborted = true;
            child.kill('SIGTERM');
            if (!failure)
                failure = new Error('Codex CLI request aborted.');
            wake();
        };
        options.signal?.addEventListener('abort', onAbort, { once: true });
        child.stdout.on('data', chunk => {
            const text = chunk.toString();
            stdout += text;
            lineBuffer += text;
            const lines = lineBuffer.split(/\r?\n/);
            lineBuffer = lines.pop() || '';
            for (const line of lines) {
                const extracted = this.extractText(line);
                if (extracted) {
                    emitted = true;
                    queue.push(extracted);
                }
            }
            wake();
        });
        child.stderr.on('data', chunk => {
            stderr += chunk.toString();
        });
        child.stdin.on('error', error => {
            if (!failure) {
                failure = new Error(`Codex CLI stdin failed for "${path}". ${error.message}`);
            }
            wake();
        });
        child.on('error', error => {
            clearTimeout(timer);
            failure = new Error(`Codex CLI was not found at "${path}". ${error.message}`);
            finished = true;
            wake();
        });
        child.on('close', code => {
            clearTimeout(timer);
            if (code !== 0 && !failure && !aborted) {
                const codexError = this.extractCodexError(stdout);
                const detail = codexError || (stderr ? this.sanitize(stderr) : '');
                failure = new Error(detail ? `Codex CLI: ${detail}` : `Codex CLI exited with code ${code}.`);
            }
            finished = true;
            wake();
        });
        try {
            child.stdin.write(options.prompt);
            child.stdin.end();
        }
        catch (error) {
            failure = new Error(`Codex CLI stdin failed for "${path}". ${error.message}`);
            wake();
        }
        try {
            while (!finished || queue.length > 0) {
                while (queue.length > 0)
                    yield queue.shift();
                if (finished)
                    break;
                await new Promise(resolve => { notify = resolve; });
            }
        }
        finally {
            options.signal?.removeEventListener('abort', onAbort);
        }
        if (aborted) {
            // Caller asked us to stop; surface partials as-is, do not throw.
            return;
        }
        if (failure) {
            if (emitted) {
                console.warn('[CodexCliService] Codex CLI stream ended after emitting partial output:', failure.message);
                return;
            }
            throw failure;
        }
        if (!emitted) {
            const normalized = this.extractText(stdout);
            if (normalized) {
                yield normalized;
                return;
            }
            const codexError = this.extractCodexError(stdout);
            throw new Error(codexError || (stderr ? this.sanitize(stderr) : 'Codex CLI returned an empty response.'));
        }
    }
    static async collect(path, options) {
        if (options.signal?.aborted)
            throw new Error('Codex CLI request aborted before start.');
        return new Promise((resolve, reject) => {
            const child = (0, child_process_1.spawn)(path, this.buildArgs(options.model, options.imagePaths, options.sandboxMode), { stdio: ['pipe', 'pipe', 'pipe'] });
            let stdout = '';
            let stderr = '';
            let settled = false;
            const settle = (fn) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                options.signal?.removeEventListener('abort', onAbort);
                fn();
            };
            const onAbort = () => {
                child.kill('SIGTERM');
                settle(() => reject(new Error('Codex CLI request aborted.')));
            };
            options.signal?.addEventListener('abort', onAbort, { once: true });
            const timer = setTimeout(() => {
                child.kill('SIGTERM');
                settle(() => reject(new Error(`Codex CLI timed out after ${options.timeoutMs}ms.`)));
            }, options.timeoutMs);
            child.stdout.on('data', chunk => {
                stdout += chunk.toString();
            });
            child.stderr.on('data', chunk => {
                stderr += chunk.toString();
            });
            child.on('error', error => {
                settle(() => reject(new Error(`Codex CLI was not found at "${path}". ${error.message}`)));
            });
            child.on('close', code => {
                settle(() => {
                    if (code === 0) {
                        resolve({ stdout, stderr: this.sanitize(stderr) });
                    }
                    else {
                        // Prefer codex's own JSON error event over the bare exit code.
                        const codexError = this.extractCodexError(stdout);
                        const detail = codexError || (stderr ? this.sanitize(stderr) : '');
                        reject(new Error(detail ? `Codex CLI: ${detail}` : `Codex CLI exited with code ${code}.`));
                    }
                });
            });
            child.stdin.on('error', error => {
                settle(() => reject(new Error(`Codex CLI stdin failed for "${path}". ${error.message}`)));
            });
            try {
                child.stdin.write(options.prompt);
                child.stdin.end();
            }
            catch (error) {
                settle(() => reject(new Error(`Codex CLI stdin failed for "${path}". ${error.message}`)));
            }
        });
    }
    static extractText(raw) {
        const text = raw.trim();
        if (!text)
            return '';
        const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        let sawJson = false;
        const extracted = lines.map(line => {
            const parsed = this.tryParseJson(line);
            if (parsed.ok) {
                sawJson = true;
                return this.findText(parsed.value);
            }
            return '';
        }).filter(Boolean).join('');
        if (extracted.trim())
            return extracted.trim();
        if (sawJson && lines.every(line => this.tryParseJson(line).ok))
            return '';
        return text
            .replace(/^\s*```(?:json)?/i, '')
            .replace(/```\s*$/i, '')
            .trim();
    }
    static tryParseJson(line) {
        try {
            return { ok: true, value: JSON.parse(line) };
        }
        catch {
            return { ok: false };
        }
    }
    // Walks the JSON event stream for error/turn.failed events and pulls the
    // human-readable message. Used to surface server-side rejections (e.g.
    // "model not supported when using Codex with a ChatGPT account") instead
    // of a generic "empty response" fallback.
    static extractCodexError(raw) {
        if (!raw)
            return '';
        for (const line of raw.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed)
                continue;
            const parsed = this.tryParseJson(trimmed);
            if (!parsed.ok)
                continue;
            const v = parsed.value;
            if (!v || typeof v !== 'object')
                continue;
            const isError = v.type === 'error' || v.type === 'turn.failed' || v.item?.type === 'error';
            if (!isError)
                continue;
            const candidates = [v.error?.message, v.error?.error?.message, v.message, v.item?.message];
            for (const c of candidates) {
                if (typeof c !== 'string' || !c)
                    continue;
                // The message is often a stringified JSON envelope; try to peel it.
                const inner = this.tryParseJson(c);
                if (inner.ok && inner.value?.error?.message)
                    return this.sanitize(inner.value.error.message);
                return this.sanitize(c);
            }
        }
        return '';
    }
    static findText(value) {
        if (!value)
            return '';
        if (typeof value === 'string')
            return value;
        if (Array.isArray(value))
            return value.map(item => this.findText(item)).filter(Boolean).join('');
        if (typeof value !== 'object')
            return '';
        if (value.type === 'error' || value.type === 'thread.started' || value.type === 'turn.started' || value.type === 'turn.completed' || value.type === 'turn.failed')
            return '';
        if (value.item?.type === 'error')
            return '';
        if (value.item?.type === 'agent_message')
            return this.findText(value.item.text);
        if (value.type === 'agent_message')
            return this.findText(value.text);
        for (const key of ['delta', 'text', 'content', 'output_text', 'output', 'response']) {
            const candidate = this.findText(value[key]);
            if (candidate)
                return candidate;
        }
        if (value.message)
            return this.findText(value.message);
        if (value.item)
            return this.findText(value.item);
        if (value.data)
            return this.findText(value.data);
        return '';
    }
    static sanitize(text) {
        return text.replace(/\s+/g, ' ').trim().slice(0, 1000);
    }
}
exports.CodexCliService = CodexCliService;
//# sourceMappingURL=CodexCliService.js.map
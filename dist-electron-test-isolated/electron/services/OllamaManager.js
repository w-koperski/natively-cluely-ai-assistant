"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaManager = void 0;
// electron/services/OllamaManager.ts
const child_process_1 = require("child_process");
const tree_kill_1 = __importDefault(require("tree-kill"));
class OllamaManager {
    static instance;
    ollamaProcess = null;
    isAppManaged = false;
    pollInterval = null;
    maxRetries = 24; // 24 attempts * 5 seconds = 120 seconds (2 minutes)
    attempts = 0;
    constructor() { }
    static getInstance() {
        if (!OllamaManager.instance) {
            OllamaManager.instance = new OllamaManager();
        }
        return OllamaManager.instance;
    }
    /**
     * Initialize the manager. Checks if Ollama is running, starts it if not.
     */
    async init() {
        console.log('[OllamaManager] Checking if Ollama is already running...');
        const isRunning = await this.checkIsRunning();
        if (isRunning) {
            console.log('[OllamaManager] Ollama is already running. App will not manage its lifecycle.');
            this.isAppManaged = false;
            return;
        }
        console.log('[OllamaManager] Ollama not detected. Attempting to start in background...');
        this.startOllama();
        this.pollUntilReady();
    }
    /**
     * Ping the local Ollama server to see if it responds.
     */
    async checkIsRunning() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1000); // 1s timeout
            const response = await fetch('http://127.0.0.1:11434/api/tags', {
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            return response.ok;
        }
        catch (error) {
            // ECONNREFUSED or timeout means it's not running
            return false;
        }
    }
    /**
     * Spawns the 'ollama serve' command invisibly.
     */
    startOllama() {
        try {
            this.isAppManaged = true;
            // Spawn detached and hidden
            this.ollamaProcess = (0, child_process_1.spawn)('ollama', ['serve'], {
                detached: false, // Keep attached to app lifecycle
                windowsHide: true, // Hide terminal on Windows
                stdio: 'ignore', // We don't care about its logs
            });
            this.ollamaProcess.on('error', (err) => {
                console.error('[OllamaManager] Failed to start Ollama. Is it installed?', err.message);
                this.isAppManaged = false;
                this.ollamaProcess = null;
                if (this.pollInterval)
                    clearInterval(this.pollInterval);
            });
            this.ollamaProcess.on('close', (code) => {
                console.log(`[OllamaManager] Process exited with code ${code}`);
                this.ollamaProcess = null;
            });
        }
        catch (err) {
            console.error('[OllamaManager] Exception while spawning Ollama:', err);
            this.isAppManaged = false;
        }
    }
    /**
     * Polls every 5 seconds for up to 2 minutes.
     */
    pollUntilReady() {
        this.attempts = 0;
        this.pollInterval = setInterval(async () => {
            this.attempts++;
            const isRunning = await this.checkIsRunning();
            if (isRunning) {
                console.log(`[OllamaManager] Successfully connected to Ollama after ${this.attempts * 5} seconds!`);
                if (this.pollInterval)
                    clearInterval(this.pollInterval);
                return;
            }
            if (this.attempts >= this.maxRetries) {
                console.log('[OllamaManager] Timeout: Failed to connect to Ollama after 2 minutes. Please check if it is installed properly.');
                if (this.pollInterval)
                    clearInterval(this.pollInterval);
            }
            else {
                console.log(`[OllamaManager] Waiting for Ollama... (Attempt ${this.attempts}/${this.maxRetries})`);
            }
        }, 5000);
        this.pollInterval.unref?.();
    }
    /**
     * Kills the Ollama process ONLY if this app started it.
     * Called when Electron is quitting.
     */
    stop() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }
        if (this.isAppManaged && this.ollamaProcess && this.ollamaProcess.pid) {
            console.log('[OllamaManager] App is quitting. Terminating managed Ollama process tree...');
            try {
                // Use tree-kill to ensure Ollama and all its nested runner processes die
                (0, tree_kill_1.default)(this.ollamaProcess.pid, 'SIGTERM', (err) => {
                    if (err) {
                        console.error('[OllamaManager] Failed to tree-kill Ollama process:', err);
                    }
                    else {
                        console.log('[OllamaManager] Successfully killed Ollama process tree.');
                    }
                });
            }
            catch (e) {
                console.error('[OllamaManager] Exception during kill:', e);
            }
        }
    }
}
exports.OllamaManager = OllamaManager;
//# sourceMappingURL=OllamaManager.js.map
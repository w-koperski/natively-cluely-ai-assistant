"use strict";
/**
 * CredentialsManager - Secure storage for API keys and service account paths
 * Uses Electron's safeStorage API for encryption at rest
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CredentialsManager = void 0;
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const CREDENTIALS_PATH = path_1.default.join(electron_1.app.getPath('userData'), 'credentials.enc');
class CredentialsManager {
    static instance;
    credentials = {};
    constructor() {
        // Load on construction after app ready
    }
    static getInstance() {
        if (!CredentialsManager.instance) {
            CredentialsManager.instance = new CredentialsManager();
        }
        return CredentialsManager.instance;
    }
    /**
     * Initialize - load credentials from disk
     * Must be called after app.whenReady()
     */
    init() {
        this.loadCredentials();
        console.log('[CredentialsManager] Initialized');
    }
    // =========================================================================
    // Getters
    // =========================================================================
    getGeminiApiKey() {
        return this.credentials.geminiApiKey;
    }
    getGroqApiKey() {
        return this.credentials.groqApiKey;
    }
    getOpenaiApiKey() {
        return this.credentials.openaiApiKey;
    }
    getClaudeApiKey() {
        return this.credentials.claudeApiKey;
    }
    getGoogleServiceAccountPath() {
        return this.credentials.googleServiceAccountPath;
    }
    getCustomProviders() {
        return this.credentials.customProviders || [];
    }
    getSttProvider() {
        const provider = this.credentials.sttProvider || 'none';
        // Self-heal: if provider is 'none' but a Natively key exists, the user is in a
        // broken state (key cleared then re-entered via a path that skipped auto-promote,
        // or credentials restored from backup). Silently restore to 'natively' so STT works.
        if (provider === 'none' && this.credentials.nativelyApiKey) {
            this.credentials.sttProvider = 'natively';
            this.saveCredentials();
            console.log('[CredentialsManager] Self-healed sttProvider: none→natively (Natively key present)');
            return 'natively';
        }
        return provider;
    }
    getDeepgramApiKey() {
        return this.credentials.deepgramApiKey;
    }
    getGroqSttApiKey() {
        return this.credentials.groqSttApiKey;
    }
    getGroqSttModel() {
        return this.credentials.groqSttModel || 'whisper-large-v3-turbo';
    }
    getOpenAiSttApiKey() {
        return this.credentials.openAiSttApiKey;
    }
    getOpenAiSttBaseUrl() {
        return this.credentials.openAiSttBaseUrl;
    }
    getElevenLabsApiKey() {
        return this.credentials.elevenLabsApiKey;
    }
    getAzureApiKey() {
        return this.credentials.azureApiKey;
    }
    getAzureRegion() {
        return this.credentials.azureRegion || 'eastus';
    }
    getIbmWatsonApiKey() {
        return this.credentials.ibmWatsonApiKey;
    }
    getIbmWatsonRegion() {
        return this.credentials.ibmWatsonRegion || 'us-south';
    }
    getSonioxApiKey() {
        return this.credentials.sonioxApiKey;
    }
    getTavilyApiKey() {
        return this.credentials.tavilyApiKey;
    }
    getSttLanguage() {
        return this.credentials.sttLanguage || 'english-us';
    }
    getAiResponseLanguage() {
        return this.credentials.aiResponseLanguage || 'auto';
    }
    getDefaultModel() {
        return this.credentials.defaultModel || 'gemini-3.1-flash-lite-preview';
    }
    getNativelyApiKey() {
        return this.credentials.nativelyApiKey;
    }
    getAllCredentials() {
        return { ...this.credentials };
    }
    // =========================================================================
    // Vision provider availability — used by the vision-first screen pipeline
    // =========================================================================
    /**
     * True if at least one configured provider is vision-capable.
     * Used by ScreenUnderstandingService to gate vision_only / decide fallback.
     */
    anyVisionProviderConfigured() {
        if (this.credentials.nativelyApiKey)
            return true; // Natively API supports vision
        if (this.credentials.openaiApiKey)
            return true; // gpt-4o / gpt-5 vision
        if (this.credentials.claudeApiKey)
            return true; // Claude vision
        if (this.credentials.geminiApiKey)
            return true; // Gemini vision
        if (this.credentials.groqApiKey)
            return true; // Groq llama-4-scout vision
        // Custom providers: only count if they have screenshots scope AND multimodal flag
        const custom = this.credentials.customProviders || [];
        if (custom.some(p => p?.multimodal === true))
            return true;
        return this.anyLocalVisionProviderConfigured();
    }
    /**
     * True if at least one LOCAL vision provider is configured (Ollama vision model,
     * Codex CLI with vision support, or a local-only custom provider).
     * Used by private_vision mode to enforce no cloud-vision calls.
     */
    anyLocalVisionProviderConfigured() {
        // Ollama: caller verifies the configured model is vision-capable via modelCapabilities.
        // Here we only assert the runtime is configured — model gating happens in the chain.
        const ollamaBaseUrl = this.credentials.ollamaBaseUrl;
        if (ollamaBaseUrl && ollamaBaseUrl.trim().length > 0)
            return true;
        // Codex CLI is local in normal install — capability is verified by ProviderRouter.
        const codexCliPath = this.credentials.codexCliPath;
        if (codexCliPath && codexCliPath.trim().length > 0)
            return true;
        return false;
    }
    // =========================================================================
    // Setters (auto-save)
    // =========================================================================
    setGeminiApiKey(key) {
        this.credentials.geminiApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] Gemini API Key updated');
    }
    setGroqApiKey(key) {
        this.credentials.groqApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] Groq API Key updated');
    }
    setOpenaiApiKey(key) {
        this.credentials.openaiApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] OpenAI API Key updated');
    }
    setClaudeApiKey(key) {
        this.credentials.claudeApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] Claude API Key updated');
    }
    setGoogleServiceAccountPath(filePath) {
        this.credentials.googleServiceAccountPath = filePath;
        this.saveCredentials();
        console.log('[CredentialsManager] Google Service Account path updated');
    }
    setSttProvider(provider) {
        this.credentials.sttProvider = provider;
        this.saveCredentials();
        console.log(`[CredentialsManager] STT Provider set to: ${provider}`);
    }
    setDeepgramApiKey(key) {
        this.credentials.deepgramApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] Deepgram API Key updated');
    }
    setGroqSttApiKey(key) {
        this.credentials.groqSttApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] Groq STT API Key updated');
    }
    setOpenAiSttApiKey(key) {
        this.credentials.openAiSttApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] OpenAI STT API Key updated');
    }
    setOpenAiSttBaseUrl(url) {
        // Store undefined (not empty string) when clearing, so callers can fall back
        // to the default api.openai.com endpoint with a simple truthiness check.
        const trimmed = url.trim();
        this.credentials.openAiSttBaseUrl = trimmed || undefined;
        this.saveCredentials();
        console.log(`[CredentialsManager] OpenAI STT Base URL set to: ${trimmed || '(default)'}`);
    }
    setGroqSttModel(model) {
        this.credentials.groqSttModel = model;
        this.saveCredentials();
        console.log(`[CredentialsManager] Groq STT Model set to: ${model}`);
    }
    setElevenLabsApiKey(key) {
        this.credentials.elevenLabsApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] ElevenLabs API Key updated');
    }
    setAzureApiKey(key) {
        this.credentials.azureApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] Azure API Key updated');
    }
    setAzureRegion(region) {
        this.credentials.azureRegion = region;
        this.saveCredentials();
        console.log(`[CredentialsManager] Azure Region set to: ${region}`);
    }
    setIbmWatsonApiKey(key) {
        this.credentials.ibmWatsonApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] IBM Watson API Key updated');
    }
    setIbmWatsonRegion(region) {
        this.credentials.ibmWatsonRegion = region;
        this.saveCredentials();
        console.log(`[CredentialsManager] IBM Watson Region set to: ${region}`);
    }
    setSonioxApiKey(key) {
        this.credentials.sonioxApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] Soniox API Key updated');
    }
    setTavilyApiKey(key) {
        // Store undefined (not empty string) when removing, so hasKey() checks stay consistent
        this.credentials.tavilyApiKey = key.trim() || undefined;
        this.saveCredentials();
        console.log('[CredentialsManager] Tavily API Key updated');
    }
    setSttLanguage(language) {
        this.credentials.sttLanguage = language;
        this.saveCredentials();
        console.log(`[CredentialsManager] STT Language set to: ${language}`);
    }
    setAiResponseLanguage(language) {
        this.credentials.aiResponseLanguage = language;
        this.saveCredentials();
        console.log(`[CredentialsManager] AI Response Language set to: ${language}`);
    }
    setDefaultModel(model) {
        this.credentials.defaultModel = model;
        this.saveCredentials();
        console.log(`[CredentialsManager] Default Model set to: ${model}`);
    }
    setNativelyApiKey(key) {
        const trimmed = key.trim();
        this.credentials.nativelyApiKey = trimmed || undefined;
        if (trimmed) {
            // Auto-promote natively to default model unless user already chose a non-Gemini/Groq model
            const current = this.credentials.defaultModel || '';
            const isAutoDefault = !current
                || current.startsWith('gemini-')
                || current.startsWith('llama-')
                || current.startsWith('mixtral-')
                || current.startsWith('gemma-')
                || current === 'gemini'
                || current === 'llama';
            if (isAutoDefault) {
                this.credentials.defaultModel = 'natively';
                console.log('[CredentialsManager] Auto-set default model to natively');
            }
            // Auto-promote natively STT if still on 'none' or the default Google STT
            if (!this.credentials.sttProvider || this.credentials.sttProvider === 'none' || this.credentials.sttProvider === 'google') {
                this.credentials.sttProvider = 'natively';
                console.log('[CredentialsManager] Auto-set STT provider to natively');
            }
        }
        else {
            // Key cleared — revert natively-auto-set defaults back to safe fallbacks
            if (this.credentials.defaultModel === 'natively') {
                this.credentials.defaultModel = 'gemini-3.1-flash-lite-preview';
                console.log('[CredentialsManager] Natively key cleared — reset default model to Gemini Flash');
            }
            if (this.credentials.sttProvider === 'natively') {
                this.credentials.sttProvider = 'none';
                console.log('[CredentialsManager] Natively key cleared — reset STT provider to none');
            }
        }
        this.saveCredentials();
        console.log('[CredentialsManager] Natively API Key updated');
    }
    getPreferredModel(provider) {
        const key = `${provider}PreferredModel`;
        return this.credentials[key];
    }
    setPreferredModel(provider, modelId) {
        const key = `${provider}PreferredModel`;
        this.credentials[key] = modelId;
        this.saveCredentials();
        console.log(`[CredentialsManager] ${provider} preferred model set to: ${modelId}`);
    }
    saveCustomProvider(provider) {
        if (!this.credentials.customProviders) {
            this.credentials.customProviders = [];
        }
        // Check if exists, update if so
        const index = this.credentials.customProviders.findIndex(p => p.id === provider.id);
        if (index !== -1) {
            this.credentials.customProviders[index] = provider;
        }
        else {
            this.credentials.customProviders.push(provider);
        }
        this.saveCredentials();
        console.log(`[CredentialsManager] Custom Provider '${provider.name}' saved`);
    }
    deleteCustomProvider(id) {
        if (!this.credentials.customProviders)
            return;
        this.credentials.customProviders = this.credentials.customProviders.filter(p => p.id !== id);
        this.saveCredentials();
        console.log(`[CredentialsManager] Custom Provider '${id}' deleted`);
    }
    getCurlProviders() {
        return this.credentials.curlProviders || [];
    }
    saveCurlProvider(provider) {
        if (!this.credentials.curlProviders) {
            this.credentials.curlProviders = [];
        }
        const index = this.credentials.curlProviders.findIndex(p => p.id === provider.id);
        if (index !== -1) {
            this.credentials.curlProviders[index] = provider;
        }
        else {
            this.credentials.curlProviders.push(provider);
        }
        this.saveCredentials();
        console.log(`[CredentialsManager] Curl Provider '${provider.name}' saved`);
    }
    deleteCurlProvider(id) {
        if (!this.credentials.curlProviders)
            return;
        this.credentials.curlProviders = this.credentials.curlProviders.filter(p => p.id !== id);
        this.saveCredentials();
        console.log(`[CredentialsManager] Curl Provider '${id}' deleted`);
    }
    // ── Free Trial ─────────────────────────────────────────────
    getTrialToken() {
        return this.credentials.trialToken;
    }
    getTrialExpiresAt() {
        return this.credentials.trialExpiresAt;
    }
    getTrialStartedAt() {
        return this.credentials.trialStartedAt;
    }
    getTrialClaimed() {
        return this.credentials.trialClaimed === true;
    }
    setTrialToken(token, expiresAt, startedAt) {
        this.credentials.trialToken = token;
        this.credentials.trialExpiresAt = expiresAt;
        this.credentials.trialStartedAt = startedAt;
        this.credentials.trialClaimed = true;
        this.saveCredentials();
        console.log('[CredentialsManager] Trial token stored, expires:', expiresAt);
    }
    clearTrialToken() {
        delete this.credentials.trialToken;
        delete this.credentials.trialExpiresAt;
        delete this.credentials.trialStartedAt;
        // trialClaimed intentionally NOT cleared — keeps start card hidden after token wipe
        this.saveCredentials();
        console.log('[CredentialsManager] Trial token cleared');
    }
    clearAll() {
        this.scrubMemory();
        if (fs_1.default.existsSync(CREDENTIALS_PATH)) {
            fs_1.default.unlinkSync(CREDENTIALS_PATH);
        }
        const plaintextPath = CREDENTIALS_PATH + '.json';
        if (fs_1.default.existsSync(plaintextPath)) {
            fs_1.default.unlinkSync(plaintextPath);
        }
        console.log('[CredentialsManager] All credentials cleared');
    }
    /**
     * Scrub all API keys from memory to minimize exposure window.
     * Called on app quit and credential clear.
     */
    scrubMemory() {
        // Overwrite each string field with empty before discarding
        for (const key of Object.keys(this.credentials)) {
            const val = this.credentials[key];
            if (typeof val === 'string') {
                this.credentials[key] = '';
            }
        }
        this.credentials = {};
        console.log('[CredentialsManager] Memory scrubbed');
    }
    // =========================================================================
    // Storage (Encrypted)
    // =========================================================================
    saveCredentials() {
        try {
            if (!electron_1.safeStorage.isEncryptionAvailable()) {
                console.warn('[CredentialsManager] Encryption not available; credentials kept in memory only');
                return;
            }
            const data = JSON.stringify(this.credentials);
            const encrypted = electron_1.safeStorage.encryptString(data);
            const tmpEnc = CREDENTIALS_PATH + '.tmp';
            fs_1.default.writeFileSync(tmpEnc, encrypted);
            fs_1.default.renameSync(tmpEnc, CREDENTIALS_PATH);
        }
        catch (error) {
            console.error('[CredentialsManager] Failed to save credentials:', error);
        }
    }
    loadCredentials() {
        try {
            // Try encrypted file first
            if (fs_1.default.existsSync(CREDENTIALS_PATH)) {
                if (!electron_1.safeStorage.isEncryptionAvailable()) {
                    console.warn('[CredentialsManager] Encryption not available for load');
                    return;
                }
                const encrypted = fs_1.default.readFileSync(CREDENTIALS_PATH);
                const decrypted = electron_1.safeStorage.decryptString(encrypted);
                try {
                    const parsed = JSON.parse(decrypted);
                    if (typeof parsed === 'object' && parsed !== null) {
                        this.credentials = parsed;
                        console.log('[CredentialsManager] Loaded encrypted credentials');
                    }
                    else {
                        throw new Error('Decrypted credentials is not a valid object');
                    }
                }
                catch (parseError) {
                    console.error('[CredentialsManager] Failed to parse decrypted credentials — file may be corrupted. Starting fresh:', parseError);
                    this.credentials = {};
                }
                // Clean up any leftover plaintext fallback file to eliminate the data leak
                const plaintextPath = CREDENTIALS_PATH + '.json';
                if (fs_1.default.existsSync(plaintextPath)) {
                    try {
                        fs_1.default.unlinkSync(plaintextPath);
                        console.log('[CredentialsManager] Removed stale plaintext credential file');
                    }
                    catch (cleanupErr) {
                        console.warn('[CredentialsManager] Could not remove stale plaintext file:', cleanupErr);
                    }
                }
                return;
            }
            const plaintextPath = CREDENTIALS_PATH + '.json';
            if (fs_1.default.existsSync(plaintextPath)) {
                try {
                    fs_1.default.unlinkSync(plaintextPath);
                    console.log('[CredentialsManager] Removed plaintext credential file');
                }
                catch (cleanupErr) {
                    console.warn('[CredentialsManager] Could not remove plaintext credential file:', cleanupErr);
                }
            }
            console.log('[CredentialsManager] No stored credentials found');
        }
        catch (error) {
            console.error('[CredentialsManager] Failed to load credentials:', error);
            this.credentials = {};
        }
    }
}
exports.CredentialsManager = CredentialsManager;
//# sourceMappingURL=CredentialsManager.js.map
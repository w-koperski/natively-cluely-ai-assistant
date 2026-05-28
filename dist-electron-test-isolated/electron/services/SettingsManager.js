"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsManager = exports.VALID_SCREEN_UNDERSTANDING_MODES = void 0;
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
exports.VALID_SCREEN_UNDERSTANDING_MODES = ['vision_first', 'vision_only', 'private_vision'];
// LEGACY values kept ONLY for migration of existing settings.json files written by older builds.
// New code MUST NOT branch on these — they are normalized to a VALID_SCREEN_UNDERSTANDING_MODES value on load.
const LEGACY_SCREEN_MODE_MIGRATION = {
    auto: 'vision_first',
    balanced: 'vision_first',
    best: 'vision_first',
    fast: 'vision_first',
    ocr_only: 'vision_first',
    private: 'private_vision',
};
class SettingsManager {
    static instance;
    settings = {};
    settingsPath;
    constructor() {
        if (!electron_1.app.isReady()) {
            throw new Error('[SettingsManager] Cannot initialize before app.whenReady()');
        }
        this.settingsPath = path_1.default.join(electron_1.app.getPath('userData'), 'settings.json');
        this.loadSettings();
    }
    static getInstance() {
        if (!SettingsManager.instance) {
            SettingsManager.instance = new SettingsManager();
        }
        return SettingsManager.instance;
    }
    get(key) {
        return this.settings[key];
    }
    set(key, value) {
        this.settings[key] = value;
        this.saveSettings();
    }
    // Resolved screen-understanding mode with default and runtime validation.
    // Use this instead of get('screenUnderstandingMode') from callers so the default applies consistently.
    getScreenUnderstandingMode() {
        const stored = this.settings.screenUnderstandingMode;
        if (stored && exports.VALID_SCREEN_UNDERSTANDING_MODES.includes(stored)) {
            return stored;
        }
        return 'vision_first';
    }
    setScreenUnderstandingMode(mode) {
        if (!exports.VALID_SCREEN_UNDERSTANDING_MODES.includes(mode)) {
            throw new Error(`[SettingsManager] Invalid screenUnderstandingMode: ${mode}`);
        }
        this.settings.screenUnderstandingMode = mode;
        this.saveSettings();
    }
    getTechnicalInterviewVisionFirst() {
        return this.settings.technicalInterviewVisionFirst !== false;
    }
    loadSettings() {
        try {
            if (fs_1.default.existsSync(this.settingsPath)) {
                const data = fs_1.default.readFileSync(this.settingsPath, 'utf8');
                try {
                    const parsed = JSON.parse(data);
                    // Minimal validation to ensure it's an object before assigning
                    if (typeof parsed === 'object' && parsed !== null) {
                        this.settings = parsed;
                        this.migrateLegacySettings();
                        console.log('[SettingsManager] Settings loaded successfully', { keys: Object.keys(this.settings).length });
                    }
                    else {
                        throw new Error('Settings JSON is not a valid object');
                    }
                }
                catch (parseError) {
                    console.error('[SettingsManager] Failed to parse settings.json. Continuing with empty settings. Error:', parseError);
                    this.settings = {};
                }
                console.log('[SettingsManager] Settings loaded');
            }
        }
        catch (e) {
            console.error('[SettingsManager] Failed to read settings file:', e);
            this.settings = {};
        }
    }
    // Normalize legacy screen-understanding mode values written by older builds.
    // Runs once on load; rewrites settings.json if any migration was applied.
    migrateLegacySettings() {
        const raw = this.settings.screenUnderstandingMode;
        if (!raw)
            return;
        if (exports.VALID_SCREEN_UNDERSTANDING_MODES.includes(raw))
            return;
        const migrated = LEGACY_SCREEN_MODE_MIGRATION[raw];
        if (migrated) {
            console.warn(`[SettingsManager] Migrating legacy screenUnderstandingMode "${raw}" → "${migrated}" (OCR runtime path removed)`);
            this.settings.screenUnderstandingMode = migrated;
            this.saveSettings();
        }
        else {
            console.warn(`[SettingsManager] Unknown legacy screenUnderstandingMode "${raw}" — defaulting to vision_first`);
            this.settings.screenUnderstandingMode = 'vision_first';
            this.saveSettings();
        }
    }
    saveSettings() {
        try {
            const tmpPath = this.settingsPath + '.tmp';
            fs_1.default.writeFileSync(tmpPath, JSON.stringify(this.settings, null, 2));
            fs_1.default.renameSync(tmpPath, this.settingsPath);
        }
        catch (e) {
            console.error('[SettingsManager] Failed to save settings:', e);
        }
    }
}
exports.SettingsManager = SettingsManager;
//# sourceMappingURL=SettingsManager.js.map
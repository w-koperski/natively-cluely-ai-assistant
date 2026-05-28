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
exports.ThemeManager = void 0;
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class ThemeManager {
    static instance;
    mode = 'system';
    configPath;
    constructor() {
        this.configPath = path.join(electron_1.app.getPath('userData'), 'theme-config.json');
        this.loadConfig();
        this.setupListeners();
    }
    static getInstance() {
        if (!ThemeManager.instance) {
            ThemeManager.instance = new ThemeManager();
        }
        return ThemeManager.instance;
    }
    loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                const data = fs.readFileSync(this.configPath, 'utf8');
                const config = JSON.parse(data);
                if (['system', 'light', 'dark'].includes(config.mode)) {
                    this.mode = config.mode;
                }
            }
        }
        catch (error) {
            console.error('Failed to load theme config:', error);
        }
    }
    saveConfig() {
        try {
            const config = { mode: this.mode };
            const tmpPath = this.configPath + '.tmp';
            fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2));
            fs.renameSync(tmpPath, this.configPath);
        }
        catch (error) {
            console.error('[ThemeManager] Failed to save config:', error);
        }
    }
    setupListeners() {
        electron_1.nativeTheme.on('updated', () => {
            if (this.mode === 'system') {
                this.broadcastThemeChange();
            }
        });
    }
    getMode() {
        return this.mode;
    }
    setMode(mode) {
        this.mode = mode;
        this.saveConfig();
        // Force native theme update if not system, so electron internal UI matches if possible
        if (mode === 'dark') {
            electron_1.nativeTheme.themeSource = 'dark';
        }
        else if (mode === 'light') {
            electron_1.nativeTheme.themeSource = 'light';
        }
        else {
            electron_1.nativeTheme.themeSource = 'system';
        }
        this.broadcastThemeChange();
    }
    getResolvedTheme() {
        if (this.mode === 'system') {
            return electron_1.nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
        }
        return this.mode;
    }
    broadcastThemeChange() {
        const payload = {
            mode: this.mode,
            resolved: this.getResolvedTheme()
        };
        electron_1.BrowserWindow.getAllWindows().forEach(win => {
            if (!win.isDestroyed()) {
                win.webContents.send('theme:changed', payload);
            }
        });
    }
}
exports.ThemeManager = ThemeManager;
//# sourceMappingURL=ThemeManager.js.map
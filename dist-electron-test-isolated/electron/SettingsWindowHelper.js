"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsWindowHelper = void 0;
const electron_1 = require("electron");
const node_path_1 = __importDefault(require("node:path"));
const isDev = process.env.NODE_ENV === "development";
const startUrl = isDev
    ? "http://localhost:5180"
    : `file://${node_path_1.default.join(electron_1.app.getAppPath(), "dist/index.html")}`;
class SettingsWindowHelper {
    settingsWindow = null;
    windowHelper = null;
    opacityTimeout = null;
    getSettingsWindow() {
        return this.settingsWindow;
    }
    setWindowDimensions(win, width, height) {
        if (!win || win.isDestroyed() || !win.isVisible())
            return;
        const currentBounds = win.getBounds();
        // Only update if dimensions actually change (avoid infinite loops)
        if (currentBounds.width === width && currentBounds.height === height)
            return;
        win.setSize(width, height);
    }
    // Store offsets relative to main window
    offsetX = 0;
    offsetY = 0;
    lastBlurTime = 0;
    ignoreBlur = false;
    constructor() { }
    setIgnoreBlur(ignore) {
        this.ignoreBlur = ignore;
    }
    /**
     * Pre-create the settings window in the background (hidden) for faster first open
     */
    preloadWindow() {
        if (!this.settingsWindow || this.settingsWindow.isDestroyed()) {
            // Create window off-screen so it's ready but not visible
            this.createWindow(-10000, -10000, false);
        }
    }
    setWindowHelper(wh) {
        this.windowHelper = wh;
    }
    toggleWindow(x, y) {
        const mainWindow = electron_1.BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w !== this.settingsWindow);
        if (mainWindow && x !== undefined && y !== undefined) {
            const bounds = mainWindow.getBounds();
            this.offsetX = x - bounds.x;
            this.offsetY = y - (bounds.y + bounds.height);
        }
        if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
            // Fix: If window was just closed by blur (e.g. clicking the toggle button), don't re-open immediately
            if (!this.settingsWindow.isVisible() && (Date.now() - this.lastBlurTime < 250)) {
                return;
            }
            if (this.settingsWindow.isVisible()) {
                this.closeWindow(); // Use closeWindow to handle focus restore
            }
            else {
                this.showWindow(x, y);
            }
        }
        else {
            this.createWindow(x, y);
        }
    }
    showWindow(x, y, options = {}) {
        if (!this.settingsWindow || this.settingsWindow.isDestroyed()) {
            this.createWindow(x, y);
            return;
        }
        const activate = options.activate ?? true;
        // Set parent to ensure it stays on top of the correct window
        const mainWin = this.windowHelper?.getMainWindow();
        if (mainWin && !mainWin.isDestroyed()) {
            this.settingsWindow.setParentWindow(mainWin);
        }
        if (x !== undefined && y !== undefined) {
            this.settingsWindow.setPosition(Math.round(x), Math.round(y));
        }
        // Ensure fully visible on screen
        this.ensureVisibleOnScreen();
        if (process.platform === 'win32' && this.contentProtection) {
            this.settingsWindow.setOpacity(0);
            if (activate)
                this.settingsWindow.show();
            else
                this.settingsWindow.showInactive();
            this.settingsWindow.setContentProtection(true);
            if (this.opacityTimeout)
                clearTimeout(this.opacityTimeout);
            this.opacityTimeout = setTimeout(() => {
                if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
                    this.settingsWindow.setOpacity(1);
                    if (activate)
                        this.settingsWindow.focus();
                }
            }, 60);
        }
        else {
            this.settingsWindow.setContentProtection(this.contentProtection);
            if (activate)
                this.settingsWindow.show();
            else
                this.settingsWindow.showInactive();
            if (activate)
                this.settingsWindow.focus();
        }
        this.emitVisibilityChange(true);
    }
    reposition(mainBounds) {
        if (!this.settingsWindow || !this.settingsWindow.isVisible() || this.settingsWindow.isDestroyed())
            return;
        const newX = mainBounds.x + this.offsetX;
        const newY = mainBounds.y + mainBounds.height + this.offsetY;
        this.settingsWindow.setPosition(Math.round(newX), Math.round(newY));
    }
    closeWindow() {
        if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
            this.settingsWindow.hide();
            this.emitVisibilityChange(false);
        }
    }
    emitVisibilityChange(isVisible) {
        const mainWindow = electron_1.BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w !== this.settingsWindow);
        if (mainWindow) {
            mainWindow.webContents.send('settings-visibility-changed', isVisible);
        }
    }
    createWindow(x, y, showWhenReady = true) {
        const isMac = process.platform === 'darwin';
        const windowSettings = {
            width: 200, // Match React component width
            height: 238, // Increased to accommodate new Transcript toggle
            frame: false,
            transparent: true,
            resizable: false,
            fullscreenable: false,
            hasShadow: false,
            alwaysOnTop: true,
            backgroundColor: "#00000000",
            show: false,
            skipTaskbar: true,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: node_path_1.default.join(__dirname, "preload.js"),
                backgroundThrottling: false // Keep window ready even when hidden
            },
            // ROUND 3 FIX: type: 'panel' is what makes this an NSPanel rather
            // than a regular NSWindow. WITHOUT it, the becomesKeyOnlyIfNeeded
            // and _setPreventsActivation: SPI calls in applyStealthToWindow
            // are no-ops (those are NSPanel-only properties — respondsToSelector
            // returns false on a plain NSWindow). The previous fix only added
            // applyStealthToWindow without the underlying panel type, which is
            // why focus theft persisted. NSPanel + type:'panel' = the same
            // Spotlight/Alfred mechanism the overlay uses.
            ...(isMac ? { type: 'panel' } : {}),
        };
        if (x !== undefined && y !== undefined) {
            windowSettings.x = Math.round(x);
            windowSettings.y = Math.round(y);
        }
        this.settingsWindow = new electron_1.BrowserWindow(windowSettings);
        if (process.platform === "darwin") {
            this.settingsWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
            this.settingsWindow.setHiddenInMissionControl(true);
            this.settingsWindow.setAlwaysOnTop(true, "floating");
        }
        console.log(`[SettingsWindowHelper] Creating Settings Window with Content Protection: ${this.contentProtection}`);
        this.settingsWindow.setContentProtection(this.contentProtection);
        // Load with query param
        const settingsUrl = isDev
            ? `${startUrl}?window=settings`
            : `${startUrl}?window=settings`; // file url also works with search params in modern Electron
        this.settingsWindow.loadURL(settingsUrl).catch(e => {
            console.error('[SettingsWindowHelper] Failed to load URL:', e);
        });
        this.settingsWindow.once('ready-to-show', () => {
            // Apply NSPanel stealth attributes (becomesKeyOnlyIfNeeded +
            // _setPreventsActivation + sharingType=None + collectionBehavior)
            // BEFORE any show() so clicking the Settings button on the
            // Natively overlay doesn't activate the Natively app and dim
            // the user's foreground app (Zoom/browser/IDE) mid-meeting.
            // Without this, settings was a regular focusable window and
            // every interaction stole focus. Failure is non-fatal; logged.
            if (process.platform === 'darwin' && this.settingsWindow && !this.settingsWindow.isDestroyed()) {
                try {
                    // eslint-disable-next-line @typescript-eslint/no-var-requires
                    const { loadNativeModule } = require('./audio/nativeModuleLoader');
                    const native = loadNativeModule();
                    if (native && typeof native.applyStealthToWindow === 'function') {
                        native.applyStealthToWindow(this.settingsWindow.getNativeWindowHandle());
                    }
                }
                catch (e) {
                    console.error('[SettingsWindowHelper] applyStealthToWindow failed:', e);
                }
            }
            if (showWhenReady) {
                this.showWindow(this.settingsWindow?.getBounds().x || 0, this.settingsWindow?.getBounds().y || 0);
            }
        });
        // Hide on blur instead of close, to keep state?
        // Or just let user close it.
        // User asked for "independent window", maybe sticky?
        // Let's keep it simple: clicks outside close it if we want "popover" behavior.
        // For now, let it stay open until toggled or ESC.
        this.settingsWindow.on('blur', () => {
            if (this.ignoreBlur)
                return;
            this.lastBlurTime = Date.now();
            this.closeWindow();
        });
        // ROUND 3 FIX (#1): when Settings becomes visible, stop the
        // CGEventTap. Otherwise the tap intercepts every plain keystroke at
        // OS level and routes them into Natively's chat input — the user
        // can't type API keys (or anything) into Settings fields. Settings
        // input is a long-form interaction; stealth-typing-into-overlay is
        // not what the user wants here. They can re-engage with the hotkey
        // after Settings closes.
        this.settingsWindow.on('show', () => {
            // ROUND 4 FIX (#7): reset blur timestamp on every successful
            // show. Without this, a stale lastBlurTime from a prior session
            // (or from a brief NSPanel-nonactivating blur that did fire)
            // can keep the 250ms toggle-protection guard hot indefinitely,
            // suppressing legitimate user re-toggles. Resetting at show
            // time bounds the guard to "the LAST blur" rather than "any
            // blur ever observed."
            this.lastBlurTime = 0;
            if (process.platform !== 'darwin')
                return;
            try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const { StealthKeyboardManager } = require('./services/StealthKeyboardManager');
                StealthKeyboardManager.getInstance().stop();
            }
            catch (e) {
                console.error('[SettingsWindowHelper] failed to stop stealth tap on show:', e);
            }
        });
    }
    ensureVisibleOnScreen() {
        if (!this.settingsWindow)
            return;
        const { x, y, width, height } = this.settingsWindow.getBounds();
        const display = electron_1.screen.getDisplayNearestPoint({ x, y });
        const bounds = display.workArea;
        let newX = x;
        let newY = y;
        if (x + width > bounds.x + bounds.width) {
            newX = bounds.x + bounds.width - width;
        }
        if (y + height > bounds.y + bounds.height) {
            newY = bounds.y + bounds.height - height;
        }
        this.settingsWindow.setPosition(newX, newY);
    }
    contentProtection = false; // Track state
    setContentProtection(enable) {
        console.log(`[SettingsWindowHelper] Setting content protection to: ${enable}`);
        this.contentProtection = enable;
        if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
            this.settingsWindow.setContentProtection(enable);
        }
    }
    syncActivationPolicy() {
        if (process.platform !== 'win32')
            return;
        if (!this.settingsWindow || this.settingsWindow.isDestroyed())
            return;
        this.settingsWindow.setContentProtection(this.contentProtection);
        if (this.settingsWindow.isVisible()) {
            this.settingsWindow.setOpacity(1);
        }
    }
}
exports.SettingsWindowHelper = SettingsWindowHelper;
//# sourceMappingURL=SettingsWindowHelper.js.map
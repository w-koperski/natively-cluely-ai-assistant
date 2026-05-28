"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelSelectorWindowHelper = void 0;
const electron_1 = require("electron");
const node_path_1 = __importDefault(require("node:path"));
const isDev = process.env.NODE_ENV === "development";
const startUrl = isDev
    ? "http://localhost:5180"
    : `file://${node_path_1.default.join(electron_1.app.getAppPath(), "dist/index.html")}`;
class ModelSelectorWindowHelper {
    window = null;
    contentProtection = false;
    opacityTimeout = null;
    // Store offsets relative to main window if needed, but absolute positioning is simpler for dropdowns
    lastBlurTime = 0;
    ignoreBlur = false;
    constructor() { }
    setIgnoreBlur(ignore) {
        this.ignoreBlur = ignore;
    }
    windowHelper = null;
    setWindowHelper(wh) {
        this.windowHelper = wh;
    }
    getWindow() {
        return this.window;
    }
    preloadWindow() {
        if (!this.window || this.window.isDestroyed()) {
            this.createWindow(-10000, -10000, false);
        }
    }
    showWindow(x, y, options = {}) {
        if (!this.window || this.window.isDestroyed()) {
            this.createWindow(x, y);
            return;
        }
        const activate = options.activate ?? true;
        // Set parent and align window settings
        const mainWin = this.windowHelper?.getMainWindow();
        const isOverlay = mainWin === this.windowHelper?.getOverlayWindow();
        if (mainWin && !mainWin.isDestroyed()) {
            this.window.setParentWindow(mainWin);
        }
        if (process.platform === "darwin") {
            // Align with parent window behavior
            this.window.setVisibleOnAllWorkspaces(isOverlay, { visibleOnFullScreen: isOverlay });
            // Only set alwaysOnTop if the value is actually changing — calling it unnecessarily
            // triggers NSApp activation on macOS, stealing focus from other apps.
            const currentAlwaysOnTop = this.window.isAlwaysOnTop();
            if (currentAlwaysOnTop !== isOverlay) {
                this.window.setAlwaysOnTop(isOverlay, "floating");
            }
            // Always hide from MC as it's a dropdown
            this.window.setHiddenInMissionControl(true);
        }
        // Standard dropdown positioning
        this.window.setPosition(Math.round(x), Math.round(y));
        this.ensureVisibleOnScreen();
        if (process.platform === 'win32' && this.contentProtection) {
            this.window.setOpacity(0);
            if (activate)
                this.window.show();
            else
                this.window.showInactive();
            this.window.setContentProtection(true);
            if (this.opacityTimeout)
                clearTimeout(this.opacityTimeout);
            this.opacityTimeout = setTimeout(() => {
                if (this.window && !this.window.isDestroyed()) {
                    this.window.setOpacity(1);
                    if (activate)
                        this.window.focus();
                }
            }, 60);
        }
        else {
            this.window.setContentProtection(this.contentProtection);
            if (activate)
                this.window.show();
            else
                this.window.showInactive();
            if (activate)
                this.window.focus();
        }
    }
    hideWindow() {
        if (this.window && !this.window.isDestroyed()) {
            this.window.setParentWindow(null);
            this.window.hide();
            // Do NOT call mainWin.focus() here — the model selector is a floating dropdown.
            // Explicitly focusing the main window steals OS focus from whatever the user
            // had active (Zoom, browser, etc.) before opening the selector.
        }
    }
    toggleWindow(x, y) {
        if (this.window && !this.window.isDestroyed()) {
            // Fix: If window was just closed by blur (e.g. clicking the toggle button), don't re-open immediately
            if (!this.window.isVisible() && (Date.now() - this.lastBlurTime < 250)) {
                return;
            }
            if (this.window.isVisible()) {
                this.hideWindow();
            }
            else {
                this.showWindow(x, y);
            }
        }
        else {
            this.createWindow(x, y);
        }
    }
    closeWindow() {
        this.hideWindow();
    }
    createWindow(x, y, showWhenReady = true) {
        const isMac = process.platform === 'darwin';
        const windowSettings = {
            width: 140,
            height: 200,
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
                backgroundThrottling: false
            },
            // ROUND 3 FIX: type:'panel' makes this an NSPanel rather than a
            // regular NSWindow. Required for becomesKeyOnlyIfNeeded and
            // _setPreventsActivation: SPI calls in applyStealthToWindow to
            // actually take effect (those are NSPanel-only properties).
            // Without this, the previous applyStealthToWindow call was a
            // no-op and clicking the model selector still stole focus from
            // the user's foreground app.
            //
            // KNOWN INTERACTION: this window has an on('blur') auto-close
            // handler. With panel-nonactivating + becomesKeyOnlyIfNeeded,
            // the window may not become key on click → blur may not fire
            // as expected. Watch for "model selector won't close" reports;
            // remediation is a click-outside handler on the parent overlay.
            ...(isMac ? { type: 'panel' } : {}),
        };
        if (x !== undefined && y !== undefined) {
            windowSettings.x = Math.round(x);
            windowSettings.y = Math.round(y);
        }
        this.window = new electron_1.BrowserWindow(windowSettings);
        if (process.platform === "darwin") {
            // Initial defaults - will be updated in showWindow
            this.window.setHiddenInMissionControl(true);
        }
        // Apply content protection for Undetectable Mode
        console.log(`[ModelSelectorWindowHelper] Creating window with Content Protection: ${this.contentProtection}`);
        this.window.setContentProtection(this.contentProtection);
        // Load with query param for routing
        const url = isDev
            ? `${startUrl}?window=model-selector`
            : `${startUrl}?window=model-selector`;
        this.window.loadURL(url).catch(e => {
            console.error('[ModelSelectorWindowHelper] Failed to load URL:', e);
        });
        this.window.once('ready-to-show', () => {
            // Apply NSPanel stealth attributes BEFORE any show() so clicking
            // the model selector on the Natively overlay doesn't activate
            // Natively and dim the user's foreground app (Zoom/browser) mid
            // meeting. Without this, model-switch was a regular focusable
            // window and every interaction stole focus. Failure non-fatal.
            //
            // NOTE: model selector also uses `on('blur')` to auto-close
            // (line below). With panel-nonactivating + becomesKeyOnlyIfNeeded,
            // blur semantics are subtle — the window may not become key on
            // click and therefore never receives blur. If that proves
            // problematic, the close-on-blur handler should switch to a
            // click-outside listener registered on the parent overlay.
            if (process.platform === 'darwin' && this.window && !this.window.isDestroyed()) {
                try {
                    // eslint-disable-next-line @typescript-eslint/no-var-requires
                    const { loadNativeModule } = require('./audio/nativeModuleLoader');
                    const native = loadNativeModule();
                    if (native && typeof native.applyStealthToWindow === 'function') {
                        native.applyStealthToWindow(this.window.getNativeWindowHandle());
                    }
                }
                catch (e) {
                    console.error('[ModelSelectorWindowHelper] applyStealthToWindow failed:', e);
                }
            }
            if (showWhenReady) {
                this.showWindow(this.window?.getBounds().x || 0, this.window?.getBounds().y || 0);
            }
        });
        // Close on blur (click outside) — NOTE: with NSPanel-nonactivating
        // + becomesKeyOnlyIfNeeded, this fires unreliably (panel may never
        // become key on click → blur never fires). Click-outside close is
        // handled by the overlay-side IPC `model-selector:close-on-outside`
        // (registered when this window is shown). Keeping the blur handler
        // as belt-and-braces for the cases where it does fire (e.g. user
        // clicks a text input we don't know about).
        this.window.on('blur', () => {
            if (this.ignoreBlur)
                return;
            this.lastBlurTime = Date.now();
            this.hideWindow();
        });
        // ROUND 3 FIX (#1): stop the stealth tap when Model Selector shows,
        // mirroring the Settings handler. While brief (model selector is a
        // dropdown), interaction with the dropdown still requires keystrokes
        // to reach this window's React tree, which the tap would otherwise
        // intercept at OS level.
        this.window.on('show', () => {
            // ROUND 4 FIX (#7): see SettingsWindowHelper for rationale —
            // reset blur timestamp on show so the 250ms toggle-protection
            // guard doesn't latch open from a stale prior-session blur.
            this.lastBlurTime = 0;
            if (process.platform !== 'darwin')
                return;
            try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const { StealthKeyboardManager } = require('./services/StealthKeyboardManager');
                StealthKeyboardManager.getInstance().stop();
            }
            catch (e) {
                console.error('[ModelSelectorWindowHelper] failed to stop stealth tap on show:', e);
            }
        });
    }
    ensureVisibleOnScreen() {
        if (!this.window)
            return;
        const { x, y, width, height } = this.window.getBounds();
        const display = electron_1.screen.getDisplayNearestPoint({ x, y });
        const bounds = display.workArea;
        let newX = x;
        let newY = y;
        // Keep within horizontal bounds
        if (x + width > bounds.x + bounds.width) {
            newX = bounds.x + bounds.width - width;
        }
        if (x < bounds.x) {
            newX = bounds.x;
        }
        // Keep within vertical bounds
        if (y + height > bounds.y + bounds.height) {
            newY = bounds.y + bounds.height - height;
        }
        if (y < bounds.y) {
            newY = bounds.y;
        }
        this.window.setPosition(newX, newY);
    }
    setContentProtection(enable) {
        console.log(`[ModelSelectorWindowHelper] Setting content protection to: ${enable}`);
        this.contentProtection = enable;
        if (this.window && !this.window.isDestroyed()) {
            this.window.setContentProtection(enable);
        }
    }
    syncActivationPolicy() {
        if (process.platform !== 'win32')
            return;
        if (!this.window || this.window.isDestroyed())
            return;
        this.window.setContentProtection(this.contentProtection);
        if (this.window.isVisible()) {
            this.window.setOpacity(1);
        }
    }
}
exports.ModelSelectorWindowHelper = ModelSelectorWindowHelper;
//# sourceMappingURL=ModelSelectorWindowHelper.js.map
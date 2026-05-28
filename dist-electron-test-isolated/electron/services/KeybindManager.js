"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeybindManager = exports.DEFAULT_KEYBINDS = void 0;
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
exports.DEFAULT_KEYBINDS = [
    // General
    { id: 'general:toggle-visibility', label: 'Toggle Visibility', accelerator: 'CommandOrControl+B', isGlobal: true, defaultAccelerator: 'CommandOrControl+B' },
    { id: 'general:toggle-mouse-passthrough', label: 'Toggle Mouse Passthrough', accelerator: 'CommandOrControl+Shift+B', isGlobal: true, defaultAccelerator: 'CommandOrControl+Shift+B' },
    { id: 'general:process-screenshots', label: 'Process Screenshots', accelerator: 'CommandOrControl+Enter', isGlobal: true, defaultAccelerator: 'CommandOrControl+Enter' },
    { id: 'general:capture-and-process', label: 'Capture Screen & Ask AI (Global)', accelerator: 'CommandOrControl+Shift+Enter', isGlobal: true, defaultAccelerator: 'CommandOrControl+Shift+Enter' },
    { id: 'general:reset-cancel', label: 'Reset / Cancel', accelerator: 'CommandOrControl+R', isGlobal: true, defaultAccelerator: 'CommandOrControl+R' },
    { id: 'general:take-screenshot', label: 'Take Screenshot', accelerator: 'CommandOrControl+H', isGlobal: true, defaultAccelerator: 'CommandOrControl+H' },
    { id: 'general:selective-screenshot', label: 'Selective Screenshot', accelerator: 'CommandOrControl+Shift+H', isGlobal: true, defaultAccelerator: 'CommandOrControl+Shift+H' },
    // Chat - Global shortcuts (work even when app is not focused - stealth mode)
    { id: 'chat:whatToAnswer', label: 'What to Answer', accelerator: 'CommandOrControl+1', isGlobal: true, defaultAccelerator: 'CommandOrControl+1' },
    { id: 'chat:clarify', label: 'Clarify', accelerator: 'CommandOrControl+2', isGlobal: true, defaultAccelerator: 'CommandOrControl+2' },
    { id: 'chat:dynamicAction4', label: 'Recap / Brainstorm', accelerator: 'CommandOrControl+3', isGlobal: true, defaultAccelerator: 'CommandOrControl+3' },
    { id: 'chat:followUp', label: 'Follow Up', accelerator: 'CommandOrControl+4', isGlobal: true, defaultAccelerator: 'CommandOrControl+4' },
    { id: 'chat:answer', label: 'Answer / Record', accelerator: 'CommandOrControl+5', isGlobal: true, defaultAccelerator: 'CommandOrControl+5' },
    { id: 'chat:codeHint', label: 'Get Code Hint', accelerator: 'CommandOrControl+6', isGlobal: true, defaultAccelerator: 'CommandOrControl+6' },
    { id: 'chat:brainstorm', label: 'Brainstorm Approaches', accelerator: 'CommandOrControl+7', isGlobal: true, defaultAccelerator: 'CommandOrControl+7' },
    // Scroll shortcuts are global so they work in stealth mode without the user
    // having to click the Natively window first (regression fix for issue #233).
    // Each press kicks an inertial scroll loop in the renderer: a single tap
    // glides ~250ms then decelerates, rapid taps sustain motion. macOS Carbon
    // HotKey API does not auto-repeat with Cmd held, so inertia is what gives
    // the "hold to scroll" feel without a native key listener.
    //
    // Horizontal uses Cmd/Ctrl+Alt+Left/Right to avoid colliding with the macOS
    // line-start/line-end caret-jump shortcut that would otherwise misfire in
    // every text input system-wide while Natively is running.
    { id: 'chat:scrollUp', label: 'Scroll Up', accelerator: 'CommandOrControl+Up', isGlobal: true, defaultAccelerator: 'CommandOrControl+Up' },
    { id: 'chat:scrollDown', label: 'Scroll Down', accelerator: 'CommandOrControl+Down', isGlobal: true, defaultAccelerator: 'CommandOrControl+Down' },
    { id: 'chat:scrollLeft', label: 'Scroll Left (code block)', accelerator: 'CommandOrControl+Alt+Left', isGlobal: true, defaultAccelerator: 'CommandOrControl+Alt+Left' },
    { id: 'chat:scrollRight', label: 'Scroll Right (code block)', accelerator: 'CommandOrControl+Alt+Right', isGlobal: true, defaultAccelerator: 'CommandOrControl+Alt+Right' },
    // CommandOrControl+Shift+Space because bare Cmd+Space is Spotlight on macOS
    // and Ctrl+Space is the IME source switcher. The overlay is created with
    // type:'panel' on macOS, so focusing it does not activate the Natively app —
    // the user's foreground app keeps focus in the dock/menu bar/screen-share.
    { id: 'chat:focusInput', label: 'Toggle Stealth Typing', accelerator: 'CommandOrControl+Shift+Space', isGlobal: true, defaultAccelerator: 'CommandOrControl+Shift+Space' },
    // Window Movement - Global shortcuts (stealth window positioning)
    { id: 'window:move-up', label: 'Move Window Up', accelerator: 'CommandOrControl+Shift+Up', isGlobal: true, defaultAccelerator: 'CommandOrControl+Shift+Up' },
    { id: 'window:move-down', label: 'Move Window Down', accelerator: 'CommandOrControl+Shift+Down', isGlobal: true, defaultAccelerator: 'CommandOrControl+Shift+Down' },
    { id: 'window:move-left', label: 'Move Window Left', accelerator: 'CommandOrControl+Shift+Left', isGlobal: true, defaultAccelerator: 'CommandOrControl+Shift+Left' },
    { id: 'window:move-right', label: 'Move Window Right', accelerator: 'CommandOrControl+Shift+Right', isGlobal: true, defaultAccelerator: 'CommandOrControl+Shift+Right' },
];
class KeybindManager {
    static instance;
    keybinds = new Map();
    filePath;
    windowHelper; // Type avoided for circular dep, passed in init
    onUpdateCallbacks = [];
    onShortcutTriggeredCallbacks = [];
    activeMode = 'launcher';
    healthCheckTimer = null;
    // How often to poll that OS-registered shortcuts are still alive (ms).
    // 10 s is aggressive enough to recover within one poll cycle after a
    // passthrough toggle, sleep/wake, or workspace switch.
    static HEALTH_CHECK_INTERVAL_MS = 10_000;
    setMode(mode) {
        if (this.activeMode === mode)
            return;
        this.activeMode = mode;
        console.log(`[KeybindManager] Mode changed to: ${mode}. Refreshing global shortcuts.`);
        this.registerGlobalShortcuts();
    }
    shouldRegister(actionId) {
        if (this.activeMode === 'overlay')
            return true;
        // In launcher mode, register visibility + movement shortcuts
        if (actionId === 'general:toggle-visibility')
            return true;
        if (actionId === 'general:toggle-mouse-passthrough')
            return true;
        if (actionId.startsWith('window:move-'))
            return true;
        // Screenshot & screen-analyze shortcuts must work globally in BOTH modes.
        // Without these, Cmd+H / Cmd+Shift+H / Cmd+Shift+Enter do nothing in
        // launcher mode because globalShortcut.register() is never called for them.
        // Also fixes the silent rebind failure: re-registration after setKeybind()
        // hit the same gate and dropped the newly bound accelerator too.
        if (actionId === 'general:take-screenshot')
            return true;
        if (actionId === 'general:selective-screenshot')
            return true;
        if (actionId === 'general:capture-and-process')
            return true;
        return false;
    }
    normalizeAccelerator(acc) {
        if (!acc)
            return '';
        // Electron accelerators are case-insensitive and order-independent for modifiers.
        // We split, lowercase, and sort to ensure consistent string matching.
        // E.g., 'Shift+CommandOrControl+Up' === 'CommandOrControl+Shift+Up'
        const parts = acc.split('+').map(p => p.trim().toLowerCase());
        parts.sort();
        return parts.join('+');
    }
    constructor() {
        this.filePath = path_1.default.join(electron_1.app.getPath('userData'), 'keybinds.json');
        this.load();
    }
    onUpdate(callback) {
        this.onUpdateCallbacks.push(callback);
    }
    onShortcutTriggered(callback) {
        this.onShortcutTriggeredCallbacks.push(callback);
    }
    static getInstance() {
        if (!KeybindManager.instance) {
            KeybindManager.instance = new KeybindManager();
        }
        return KeybindManager.instance;
    }
    setWindowHelper(windowHelper) {
        this.windowHelper = windowHelper;
    }
    load() {
        // 1. Load Defaults
        exports.DEFAULT_KEYBINDS.forEach(kb => this.keybinds.set(kb.id, { ...kb }));
        // 2. Load Overrides
        try {
            if (fs_1.default.existsSync(this.filePath)) {
                const data = JSON.parse(fs_1.default.readFileSync(this.filePath, 'utf-8'));
                // Migrate renamed IDs so saved user customizations survive renames
                const ID_MIGRATIONS = {
                    'chat:recap': 'chat:dynamicAction4',
                    'chat:followup': 'chat:followUp', // casing fix — persisted keybinds.json may have old casing
                };
                for (const fileKb of data) {
                    if (ID_MIGRATIONS[fileKb.id]) {
                        fileKb.id = ID_MIGRATIONS[fileKb.id];
                    }
                }
                // Validate and merge
                let hadConflicts = false;
                for (const fileKb of data) {
                    if (this.keybinds.has(fileKb.id)) {
                        const current = this.keybinds.get(fileKb.id);
                        // Deduplicate: If another keybind is already using this accelerator, skip or clear it
                        if (fileKb.accelerator && fileKb.accelerator.trim() !== '') {
                            let conflictId = null;
                            const normalizedNew = this.normalizeAccelerator(fileKb.accelerator);
                            this.keybinds.forEach((kb, existingId) => {
                                if (existingId !== fileKb.id && this.normalizeAccelerator(kb.accelerator) === normalizedNew) {
                                    conflictId = existingId;
                                }
                            });
                            if (conflictId) {
                                // EC-03 fix: mark that we resolved a conflict so we can persist below
                                const conflictKb = this.keybinds.get(conflictId);
                                conflictKb.accelerator = '';
                                this.keybinds.set(conflictId, conflictKb);
                                hadConflicts = true;
                            }
                        }
                        current.accelerator = fileKb.accelerator;
                        this.keybinds.set(fileKb.id, current);
                    }
                }
                // EC-03 fix: persist resolved conflicts so they are not re-detected on next launch
                if (hadConflicts) {
                    this.save();
                }
            }
        }
        catch (error) {
            console.error('[KeybindManager] Failed to load keybinds:', error);
        }
    }
    save() {
        try {
            const data = Array.from(this.keybinds.values()).map(kb => ({
                id: kb.id,
                accelerator: kb.accelerator
            }));
            const tmpPath = this.filePath + '.tmp';
            fs_1.default.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
            fs_1.default.renameSync(tmpPath, this.filePath);
        }
        catch (error) {
            console.error('[KeybindManager] Failed to save keybinds:', error);
        }
    }
    getKeybind(id) {
        return this.keybinds.get(id)?.accelerator;
    }
    getAllKeybinds() {
        return Array.from(this.keybinds.values());
    }
    setKeybind(id, accelerator) {
        if (!this.keybinds.has(id))
            return;
        const currentKb = this.keybinds.get(id);
        const oldAccelerator = currentKb.accelerator || '';
        // Fallback: If assigning a new accelerator, swap any existing action using it
        if (accelerator && accelerator.trim() !== '') {
            const normalizedNew = this.normalizeAccelerator(accelerator);
            let swappedId = null;
            this.keybinds.forEach((kb, existingId) => {
                if (existingId !== id && this.normalizeAccelerator(kb.accelerator) === normalizedNew) {
                    swappedId = existingId;
                }
            });
            if (swappedId) {
                const conflictKb = this.keybinds.get(swappedId);
                conflictKb.accelerator = oldAccelerator; // Give the conflicting one our old shortcut
                this.keybinds.set(swappedId, conflictKb);
            }
        }
        currentKb.accelerator = accelerator;
        this.keybinds.set(id, currentKb);
        this.save();
        this.registerGlobalShortcuts(); // Re-register if it was a global one
        this.broadcastUpdate();
    }
    resetKeybinds() {
        this.keybinds.clear();
        exports.DEFAULT_KEYBINDS.forEach(kb => this.keybinds.set(kb.id, { ...kb }));
        this.save();
        this.registerGlobalShortcuts();
        this.broadcastUpdate();
    }
    registerGlobalShortcuts() {
        electron_1.globalShortcut.unregisterAll();
        this.keybinds.forEach(kb => {
            if (kb.isGlobal && kb.accelerator && kb.accelerator.trim() !== '') {
                if (!this.shouldRegister(kb.id))
                    return;
                const acc = kb.accelerator.trim();
                try {
                    electron_1.globalShortcut.register(acc, () => {
                        this.onShortcutTriggeredCallbacks.forEach(cb => cb(kb.id));
                    });
                    if (electron_1.globalShortcut.isRegistered(acc)) {
                        console.log(`[KeybindManager] Registered global shortcut: ${acc} -> ${kb.id}`);
                    }
                    else {
                        console.warn(`[KeybindManager] Failed to register global shortcut (likely in use by OS): ${acc}`);
                        // Notify renderer so the UI can surface a warning to the user (issue #136)
                        electron_1.BrowserWindow.getAllWindows().forEach(win => {
                            if (!win.isDestroyed()) {
                                win.webContents.send('keybinds:registration-failed', { id: kb.id, accelerator: acc });
                            }
                        });
                    }
                }
                catch (e) {
                    console.error(`[KeybindManager] Exception while registering global shortcut ${acc}:`, e);
                }
            }
        });
        this.updateMenu();
        // (Re-)start the health-check loop so it always reflects the current
        // registered set after any full re-registration.
        this.startHealthCheck();
    }
    /**
     * Surgically re-registers any global shortcuts the OS silently dropped.
     *
     * Unlike registerGlobalShortcuts() this does NOT call unregisterAll() first,
     * so there is never a window where shortcuts are momentarily absent.  It is
     * safe to call from the periodic health-check timer or right after a window
     * interaction-policy change (e.g. passthrough toggle).
     */
    revalidateShortcuts() {
        let lost = 0;
        let recovered = 0;
        this.keybinds.forEach(kb => {
            if (!kb.isGlobal || !kb.accelerator || kb.accelerator.trim() === '')
                return;
            if (!this.shouldRegister(kb.id))
                return;
            const acc = kb.accelerator.trim();
            if (electron_1.globalShortcut.isRegistered(acc))
                return; // still alive — nothing to do
            lost++;
            try {
                electron_1.globalShortcut.register(acc, () => {
                    this.onShortcutTriggeredCallbacks.forEach(cb => cb(kb.id));
                });
                if (electron_1.globalShortcut.isRegistered(acc)) {
                    recovered++;
                    console.warn(`[KeybindManager] Recovered lost shortcut: ${acc} -> ${kb.id}`);
                }
                else {
                    console.error(`[KeybindManager] Could not recover shortcut ${acc} -> ${kb.id} (OS conflict?)`);
                }
            }
            catch (e) {
                console.error(`[KeybindManager] Exception re-registering shortcut ${acc}:`, e);
            }
        });
        if (lost > 0) {
            console.warn(`[KeybindManager] Health check: ${lost} shortcut(s) were dropped by OS, ${recovered} recovered.`);
        }
    }
    /**
     * Starts (or restarts) the periodic shortcut health-check timer.
     * Called automatically at the end of registerGlobalShortcuts() so the timer
     * always tracks the most recently registered set.
     */
    startHealthCheck() {
        this.stopHealthCheck();
        this.healthCheckTimer = setInterval(() => {
            this.revalidateShortcuts();
        }, KeybindManager.HEALTH_CHECK_INTERVAL_MS);
        // Allow the Node.js process to exit even if this timer is still running.
        if (this.healthCheckTimer.unref)
            this.healthCheckTimer.unref();
    }
    /** Clears the health-check interval (called before a full re-registration). */
    stopHealthCheck() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
    }
    updateMenu() {
        // On Windows/Linux, set a minimal menu (for shortcuts like DevTools)
        // but hide the menu bar from the UI
        if (process.platform !== 'darwin') {
            const template = [
                {
                    label: 'View',
                    submenu: [
                        { role: 'reload' },
                        { role: 'forceReload' },
                        { role: 'toggleDevTools' },
                        { type: 'separator' },
                        { role: 'resetZoom' },
                        { role: 'zoomIn' },
                        { role: 'zoomOut' },
                        { type: 'separator' },
                        { role: 'togglefullscreen' }
                    ]
                }
            ];
            const menu = electron_1.Menu.buildFromTemplate(template);
            electron_1.Menu.setApplicationMenu(menu);
            return;
        }
        const toggleKb = this.keybinds.get('general:toggle-visibility');
        const toggleAccelerator = toggleKb ? toggleKb.accelerator : 'CommandOrControl+B';
        const template = [
            {
                label: electron_1.app.name,
                submenu: [
                    { role: 'about' },
                    { type: 'separator' },
                    { role: 'services' },
                    { type: 'separator' },
                    { role: 'hide', accelerator: 'CommandOrControl+Option+H' },
                    { role: 'hideOthers', accelerator: 'CommandOrControl+Option+Shift+H' },
                    { role: 'unhide' },
                    { type: 'separator' },
                    { role: 'quit' }
                ]
            },
            {
                role: 'editMenu'
            },
            {
                label: 'View',
                submenu: [
                    {
                        label: 'Toggle Visibility',
                        accelerator: toggleAccelerator || undefined,
                        click: () => {
                            // Require AppState dynamically to avoid circular dependencies
                            const { AppState } = require('../main');
                            AppState.getInstance().toggleMainWindow();
                        }
                    },
                    { type: 'separator' },
                    {
                        label: 'Move Window Up',
                        accelerator: this.getKeybind('window:move-up') || undefined,
                        click: () => this.windowHelper?.moveWindowUp()
                    },
                    {
                        label: 'Move Window Down',
                        accelerator: this.getKeybind('window:move-down') || undefined,
                        click: () => this.windowHelper?.moveWindowDown()
                    },
                    {
                        label: 'Move Window Left',
                        accelerator: this.getKeybind('window:move-left') || undefined,
                        click: () => this.windowHelper?.moveWindowLeft()
                    },
                    {
                        label: 'Move Window Right',
                        accelerator: this.getKeybind('window:move-right') || undefined,
                        click: () => this.windowHelper?.moveWindowRight()
                    },
                    { type: 'separator' },
                    { role: 'reload' },
                    { role: 'forceReload' },
                    { role: 'toggleDevTools' },
                    { type: 'separator' },
                    { role: 'resetZoom' },
                    { role: 'zoomIn' },
                    { role: 'zoomOut' },
                    { type: 'separator' },
                    { role: 'togglefullscreen' }
                ]
            },
            {
                role: 'windowMenu'
            },
            {
                role: 'help',
                submenu: [
                    {
                        label: 'Learn More',
                        click: async () => {
                            const { shell } = require('electron');
                            await shell.openExternal('https://electronjs.org');
                        }
                    }
                ]
            }
        ];
        const menu = electron_1.Menu.buildFromTemplate(template);
        electron_1.Menu.setApplicationMenu(menu);
        console.log('[KeybindManager] Application menu updated');
    }
    broadcastUpdate() {
        // Notify main process listeners
        this.onUpdateCallbacks.forEach(cb => cb());
        const windows = electron_1.BrowserWindow.getAllWindows();
        const allKeybinds = this.getAllKeybinds();
        windows.forEach(win => {
            if (!win.isDestroyed()) {
                win.webContents.send('keybinds:update', allKeybinds);
            }
        });
    }
    setupIpcHandlers() {
        electron_1.ipcMain.handle('keybinds:get-all', () => {
            return this.getAllKeybinds();
        });
        electron_1.ipcMain.handle('keybinds:set', (_, id, accelerator) => {
            console.log(`[KeybindManager] Set ${id} -> ${accelerator}`);
            this.setKeybind(id, accelerator);
            return true;
        });
        electron_1.ipcMain.handle('keybinds:reset', () => {
            console.log('[KeybindManager] Reset defaults');
            this.resetKeybinds();
            return this.getAllKeybinds();
        });
    }
}
exports.KeybindManager = KeybindManager;
//# sourceMappingURL=KeybindManager.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DonationManager = void 0;
const electron_store_1 = __importDefault(require("electron-store"));
class DonationManager {
    static instance;
    store;
    // Constants
    MAX_LIFETIME_SHOWS = 5;
    DAYS_INTERVAL = 21;
    SHOW_DELAY_MS = 10000; // 10 seconds after app start
    constructor() {
        this.store = new electron_store_1.default({
            name: 'natively-preferences-secure', // Different file than main config
            defaults: {
                hasDonated: false,
                lastShownAt: null,
                lifetimeShows: 0
            },
            // Encryption in v8 worked fine, keeping it for "obvious tampering" protection
            encryptionKey: 'natively-secure-storage-key'
        });
    }
    static getInstance() {
        if (!DonationManager.instance) {
            DonationManager.instance = new DonationManager();
        }
        return DonationManager.instance;
    }
    getDonationState() {
        return {
            hasDonated: this.store.get('hasDonated'),
            lastShownAt: this.store.get('lastShownAt'),
            lifetimeShows: this.store.get('lifetimeShows')
        };
    }
    shouldShowToaster() {
        const state = this.getDonationState();
        // 1. If already donated, never show
        if (state.hasDonated)
            return false;
        // 2. If exceeded max shows, never show
        if (state.lifetimeShows >= this.MAX_LIFETIME_SHOWS)
            return false;
        // 3. Check time interval
        if (state.lastShownAt === null) {
            // First time ever? Show it
            return true;
        }
        const now = Date.now();
        const daysSinceLastShow = (now - state.lastShownAt) / (1000 * 60 * 60 * 24);
        return daysSinceLastShow >= this.DAYS_INTERVAL;
    }
    markAsShown() {
        const state = this.getDonationState();
        this.store.set({
            hasDonated: state.hasDonated, // Preserve existing
            lastShownAt: Date.now(),
            lifetimeShows: state.lifetimeShows + 1
        });
        console.log('[DonationManager] Toaster shown. Count:', state.lifetimeShows + 1);
    }
    setHasDonated(status) {
        this.store.set('hasDonated', status);
    }
}
exports.DonationManager = DonationManager;
//# sourceMappingURL=DonationManager.js.map
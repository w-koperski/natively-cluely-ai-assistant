"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DynamicActionStore = void 0;
class DynamicActionStore {
    actions = new Map();
    addAction(action) {
        this.actions.set(action.id, action);
    }
    updateStatus(id, status) {
        const action = this.actions.get(id);
        if (action) {
            action.status = status;
        }
    }
    getActiveActions(sessionId) {
        const now = Date.now();
        return Array.from(this.actions.values()).filter((action) => action.sessionId === sessionId &&
            action.status !== 'expired' &&
            action.status !== 'completed' &&
            action.status !== 'dismissed' &&
            (!action.expiresAt || action.expiresAt > now));
    }
    expireStaleActions(sessionId, maxAgeMs) {
        const now = Date.now();
        const cutoff = now - maxAgeMs;
        for (const action of this.actions.values()) {
            if (action.sessionId === sessionId &&
                action.createdAt < cutoff &&
                action.status === 'candidate') {
                action.status = 'expired';
            }
        }
    }
    deduplicate(newAction, windowMs = 120000) {
        const now = Date.now();
        const windowStart = now - windowMs;
        for (const existing of this.actions.values()) {
            if (existing.sessionId === newAction.sessionId &&
                existing.modeId === newAction.modeId &&
                existing.type === newAction.type &&
                existing.status !== 'expired' &&
                existing.status !== 'dismissed' &&
                existing.createdAt > windowStart) {
                return null; // Suppress duplicate
            }
        }
        return newAction;
    }
    getAction(id) {
        return this.actions.get(id);
    }
    getAllActions(sessionId) {
        return Array.from(this.actions.values()).filter((action) => action.sessionId === sessionId);
    }
}
exports.DynamicActionStore = DynamicActionStore;
//# sourceMappingURL=DynamicActionStore.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DynamicActionEngine = void 0;
const DynamicActionStore_1 = require("./DynamicActionStore");
const DynamicActionDetector_1 = require("./DynamicActionDetector");
class DynamicActionEngine {
    store;
    detector;
    constructor(store = new DynamicActionStore_1.DynamicActionStore(), detector = new DynamicActionDetector_1.DynamicActionDetector(DynamicActionDetector_1.MODE_TRIGGERS)) {
        this.store = store;
        this.detector = detector;
    }
    detectActions(params) {
        const { transcript, speaker, modeTemplateType, modeId, sessionId } = params;
        const now = Date.now();
        const candidateActions = [];
        // Detect triggers using regex patterns
        const matchedTriggers = this.detector.detectTriggers({ transcript, modeTemplateType });
        for (const { trigger, match, index } of matchedTriggers) {
            // Build evidence ref from transcript
            const evidenceRef = {
                source: 'transcript',
                text: transcript,
                timestamp: now,
                speaker,
            };
            // Create candidate action
            const action = {
                id: `action_${now}_${Math.random().toString(36).slice(2, 6)}`,
                sessionId,
                modeId,
                modeTemplateType,
                type: trigger.type,
                label: trigger.label,
                description: `Triggered by: "${match}"`,
                confidence: trigger.priority,
                priority: trigger.priority,
                evidenceRefs: [evidenceRef],
                status: 'candidate',
                createdAt: now,
                promptInstruction: trigger.promptInstruction,
                answerStyle: trigger.answerStyle,
            };
            // Check deduplication
            const deduplicatedAction = this.store.deduplicate(action);
            if (deduplicatedAction) {
                candidateActions.push(deduplicatedAction);
                this.store.addAction(deduplicatedAction);
            }
        }
        return candidateActions;
    }
    getTopActions(sessionId, maxAgeMs = 60000) {
        // Expire stale actions first
        this.store.expireStaleActions(sessionId, maxAgeMs);
        // Get active actions sorted by priority (descending)
        const activeActions = this.store.getActiveActions(sessionId);
        return activeActions
            .sort((a, b) => b.priority - a.priority)
            .slice(0, 3);
    }
    acceptAction(actionId) {
        const action = this.store.getAction(actionId);
        if (action) {
            this.store.updateStatus(actionId, 'accepted');
            return action;
        }
        return null;
    }
    dismissAction(actionId) {
        this.store.updateStatus(actionId, 'dismissed');
    }
    completeAction(actionId) {
        this.store.updateStatus(actionId, 'completed');
    }
    getStore() {
        return this.store;
    }
    getDetector() {
        return this.detector;
    }
}
exports.DynamicActionEngine = DynamicActionEngine;
//# sourceMappingURL=DynamicActionEngine.js.map
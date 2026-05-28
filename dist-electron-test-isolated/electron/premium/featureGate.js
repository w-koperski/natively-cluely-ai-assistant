"use strict";
/**
 * Centralized Feature Gate for Premium Features.
 *
 * Determines at runtime whether premium modules (LicenseManager,
 * KnowledgeOrchestrator, etc.) are available. This allows the
 * open-source version to compile and run without premium code.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPremiumAvailable = isPremiumAvailable;
exports.resetFeatureGate = resetFeatureGate;
let _premiumAvailable = null;
/**
 * Check if premium modules are available in this build.
 * Result is cached after the first call.
 */
function isPremiumAvailable() {
    if (_premiumAvailable !== null)
        return _premiumAvailable;
    try {
        // Probe for the critical premium modules in the premium/ directory
        require('../../premium/electron/services/LicenseManager');
        require('../../premium/electron/knowledge/KnowledgeOrchestrator');
        _premiumAvailable = true;
    }
    catch {
        _premiumAvailable = false;
        console.log('[FeatureGate] Premium modules not available — running in open-source mode.');
    }
    return _premiumAvailable;
}
/**
 * Reset the cached premium availability check.
 * Useful for testing.
 */
function resetFeatureGate() {
    _premiumAvailable = null;
}
//# sourceMappingURL=featureGate.js.map
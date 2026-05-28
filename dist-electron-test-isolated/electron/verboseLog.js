"use strict";
/**
 * verboseLog.ts
 * Module-level singleton flag for verbose/debug logging.
 * Import isVerboseLogging() anywhere in the electron main process to gate
 * diagnostic logs. The flag is toggled via AppState.setVerboseLogging() which
 * persists it through SettingsManager.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.setVerboseLoggingFlag = exports.isVerboseLogging = void 0;
let _verbose = false;
const isVerboseLogging = () => _verbose;
exports.isVerboseLogging = isVerboseLogging;
const setVerboseLoggingFlag = (enabled) => {
    _verbose = enabled;
};
exports.setVerboseLoggingFlag = setVerboseLoggingFlag;
//# sourceMappingURL=verboseLog.js.map
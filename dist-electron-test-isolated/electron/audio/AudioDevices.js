"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AudioDevices = void 0;
const nativeModuleLoader_1 = require("./nativeModuleLoader");
// NativeModule may be null if the Rust binary isn't built yet (new clone without `npm run build:native`).
// All methods below handle this gracefully by returning empty arrays.
const NativeModule = (0, nativeModuleLoader_1.loadNativeModule)();
const { getInputDevices, getOutputDevices } = NativeModule || {};
class AudioDevices {
    static getInputDevices() {
        if (!getInputDevices) {
            console.warn('[AudioDevices] Native functionality not available');
            return [];
        }
        try {
            return getInputDevices();
        }
        catch (e) {
            console.error('[AudioDevices] Failed to get input devices:', e);
            return [];
        }
    }
    static getOutputDevices() {
        if (!getOutputDevices) {
            console.warn('[AudioDevices] Native functionality not available');
            return [];
        }
        try {
            return getOutputDevices();
        }
        catch (e) {
            console.error('[AudioDevices] Failed to get output devices:', e);
            return [];
        }
    }
}
exports.AudioDevices = AudioDevices;
//# sourceMappingURL=AudioDevices.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROCESSING_EVENTS = void 0;
const electron_1 = require("electron");
exports.PROCESSING_EVENTS = {
    //global states
    UNAUTHORIZED: 'procesing-unauthorized',
    NO_SCREENSHOTS: 'processing-no-screenshots',
    //states for generating the initial solution
    INITIAL_START: 'initial-start',
    PROBLEM_EXTRACTED: 'problem-extracted',
    SOLUTION_SUCCESS: 'solution-success',
    INITIAL_SOLUTION_ERROR: 'solution-error',
    //states for processing the debugging
    DEBUG_START: 'debug-start',
    DEBUG_SUCCESS: 'debug-success',
    DEBUG_ERROR: 'debug-error',
};
// Expose the Electron API to the renderer process
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    updateContentDimensions: (dimensions) => electron_1.ipcRenderer.invoke('update-content-dimensions', dimensions),
    updateContentDimensionsCentered: (dimensions) => electron_1.ipcRenderer.invoke('update-content-dimensions-centered', dimensions),
    getRecognitionLanguages: () => electron_1.ipcRenderer.invoke('get-recognition-languages'),
    takeScreenshot: () => electron_1.ipcRenderer.invoke('take-screenshot'),
    takeSelectiveScreenshot: () => electron_1.ipcRenderer.invoke('take-selective-screenshot'),
    getScreenshots: () => electron_1.ipcRenderer.invoke('get-screenshots'),
    deleteScreenshot: (path) => electron_1.ipcRenderer.invoke('delete-screenshot', path),
    // Event listeners
    onScreenshotTaken: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('screenshot-taken', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('screenshot-taken', subscription);
        };
    },
    onScreenshotAttached: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('screenshot-attached', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('screenshot-attached', subscription);
        };
    },
    onCaptureAndProcess: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('capture-and-process', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('capture-and-process', subscription);
        };
    },
    onSolutionsReady: (callback) => {
        const subscription = (_, solutions) => callback(solutions);
        electron_1.ipcRenderer.on('solutions-ready', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('solutions-ready', subscription);
        };
    },
    onResetView: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on('reset-view', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('reset-view', subscription);
        };
    },
    onSolutionStart: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on(exports.PROCESSING_EVENTS.INITIAL_START, subscription);
        return () => {
            electron_1.ipcRenderer.removeListener(exports.PROCESSING_EVENTS.INITIAL_START, subscription);
        };
    },
    onDebugStart: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on(exports.PROCESSING_EVENTS.DEBUG_START, subscription);
        return () => {
            electron_1.ipcRenderer.removeListener(exports.PROCESSING_EVENTS.DEBUG_START, subscription);
        };
    },
    onDebugSuccess: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('debug-success', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('debug-success', subscription);
        };
    },
    onDebugError: (callback) => {
        const subscription = (_, error) => callback(error);
        electron_1.ipcRenderer.on(exports.PROCESSING_EVENTS.DEBUG_ERROR, subscription);
        return () => {
            electron_1.ipcRenderer.removeListener(exports.PROCESSING_EVENTS.DEBUG_ERROR, subscription);
        };
    },
    onSolutionError: (callback) => {
        const subscription = (_, error) => callback(error);
        electron_1.ipcRenderer.on(exports.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR, subscription);
        return () => {
            electron_1.ipcRenderer.removeListener(exports.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR, subscription);
        };
    },
    onProcessingNoScreenshots: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on(exports.PROCESSING_EVENTS.NO_SCREENSHOTS, subscription);
        return () => {
            electron_1.ipcRenderer.removeListener(exports.PROCESSING_EVENTS.NO_SCREENSHOTS, subscription);
        };
    },
    onProblemExtracted: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on(exports.PROCESSING_EVENTS.PROBLEM_EXTRACTED, subscription);
        return () => {
            electron_1.ipcRenderer.removeListener(exports.PROCESSING_EVENTS.PROBLEM_EXTRACTED, subscription);
        };
    },
    onSolutionSuccess: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on(exports.PROCESSING_EVENTS.SOLUTION_SUCCESS, subscription);
        return () => {
            electron_1.ipcRenderer.removeListener(exports.PROCESSING_EVENTS.SOLUTION_SUCCESS, subscription);
        };
    },
    onUnauthorized: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on(exports.PROCESSING_EVENTS.UNAUTHORIZED, subscription);
        return () => {
            electron_1.ipcRenderer.removeListener(exports.PROCESSING_EVENTS.UNAUTHORIZED, subscription);
        };
    },
    moveWindowLeft: () => electron_1.ipcRenderer.invoke('move-window-left'),
    moveWindowRight: () => electron_1.ipcRenderer.invoke('move-window-right'),
    moveWindowUp: () => electron_1.ipcRenderer.invoke('move-window-up'),
    moveWindowDown: () => electron_1.ipcRenderer.invoke('move-window-down'),
    windowMinimize: () => electron_1.ipcRenderer.invoke('window-minimize'),
    windowMaximize: () => electron_1.ipcRenderer.invoke('window-maximize'),
    windowClose: () => electron_1.ipcRenderer.invoke('window-close'),
    windowIsMaximized: () => electron_1.ipcRenderer.invoke('window-is-maximized'),
    analyzeImageFile: (path) => electron_1.ipcRenderer.invoke('analyze-image-file', path),
    quitApp: () => electron_1.ipcRenderer.invoke('quit-app'),
    toggleWindow: () => electron_1.ipcRenderer.invoke('toggle-window'),
    showWindow: (inactive) => electron_1.ipcRenderer.invoke('show-window', inactive),
    hideWindow: () => electron_1.ipcRenderer.invoke('hide-window'),
    showOverlay: () => electron_1.ipcRenderer.invoke('show-overlay'),
    hideOverlay: () => electron_1.ipcRenderer.invoke('hide-overlay'),
    getMeetingActive: () => electron_1.ipcRenderer.invoke('get-meeting-active'),
    onMeetingStateChanged: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('meeting-state-changed', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('meeting-state-changed', subscription);
        };
    },
    onWindowMaximizedChanged: (callback) => {
        const subscription = (_, isMaximized) => callback(isMaximized);
        electron_1.ipcRenderer.on('window-maximized-changed', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('window-maximized-changed', subscription);
        };
    },
    onEnsureExpanded: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on('ensure-expanded', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('ensure-expanded', subscription);
        };
    },
    toggleAdvancedSettings: () => electron_1.ipcRenderer.invoke('toggle-advanced-settings'),
    openSettingsTab: (tab) => electron_1.ipcRenderer.invoke('settings:open-tab', tab),
    onOpenSettingsTab: (callback) => {
        const subscription = (_, tab) => callback(tab);
        electron_1.ipcRenderer.on('settings:open-tab', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('settings:open-tab', subscription);
        };
    },
    openExternal: (url) => electron_1.ipcRenderer.invoke('open-external', url),
    setUndetectable: (state) => electron_1.ipcRenderer.invoke('set-undetectable', state),
    getUndetectable: () => electron_1.ipcRenderer.invoke('get-undetectable'),
    setOverlayMousePassthrough: (enabled) => electron_1.ipcRenderer.invoke('set-overlay-mouse-passthrough', enabled),
    toggleOverlayMousePassthrough: () => electron_1.ipcRenderer.invoke('toggle-overlay-mouse-passthrough'),
    getOverlayMousePassthrough: () => electron_1.ipcRenderer.invoke('get-overlay-mouse-passthrough'),
    setOpenAtLogin: (open) => electron_1.ipcRenderer.invoke('set-open-at-login', open),
    getOpenAtLogin: () => electron_1.ipcRenderer.invoke('get-open-at-login'),
    setDisguise: (mode) => electron_1.ipcRenderer.invoke('set-disguise', mode),
    getDisguise: () => electron_1.ipcRenderer.invoke('get-disguise'),
    onDisguiseChanged: (callback) => {
        const subscription = (_, mode) => callback(mode);
        electron_1.ipcRenderer.on('disguise-changed', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('disguise-changed', subscription);
        };
    },
    // Skills — local SKILL.md instructions surfaced in Settings and the overlay.
    skillsRefresh: () => electron_1.ipcRenderer.invoke('skills:list'),
    skillsOpenFolder: () => electron_1.ipcRenderer.invoke('skills:open-folder'),
    // Phone Mirror — stream live AI responses to a paired phone over the LAN.
    phoneMirrorGetInfo: () => electron_1.ipcRenderer.invoke('phone-mirror:get-info'),
    phoneMirrorEnable: (exposeOnLan) => electron_1.ipcRenderer.invoke('phone-mirror:enable', exposeOnLan),
    phoneMirrorDisable: () => electron_1.ipcRenderer.invoke('phone-mirror:disable'),
    phoneMirrorSetLan: (exposeOnLan) => electron_1.ipcRenderer.invoke('phone-mirror:set-lan', exposeOnLan),
    phoneMirrorRotateToken: () => electron_1.ipcRenderer.invoke('phone-mirror:rotate-token'),
    phoneMirrorPushScreenshot: (screenshotPath) => electron_1.ipcRenderer.invoke('phone-mirror:push-screenshot', screenshotPath),
    onPhoneMirrorStatus: (callback) => {
        const subscription = (_, info) => callback(info);
        electron_1.ipcRenderer.on('phone-mirror:status', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('phone-mirror:status', subscription);
        };
    },
    onPhoneMirrorIncomingChat: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('phone-mirror:incoming-chat', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('phone-mirror:incoming-chat', subscription);
        };
    },
    onSettingsVisibilityChange: (callback) => {
        const subscription = (_, isVisible) => callback(isVisible);
        electron_1.ipcRenderer.on('settings-visibility-changed', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('settings-visibility-changed', subscription);
        };
    },
    onToggleExpand: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on('toggle-expand', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('toggle-expand', subscription);
        };
    },
    // LLM Model Management
    getCurrentLlmConfig: () => electron_1.ipcRenderer.invoke('get-current-llm-config'),
    getAvailableOllamaModels: () => electron_1.ipcRenderer.invoke('get-available-ollama-models'),
    switchToOllama: (model, url) => electron_1.ipcRenderer.invoke('switch-to-ollama', model, url),
    switchToGemini: (apiKey, modelId) => electron_1.ipcRenderer.invoke('switch-to-gemini', apiKey, modelId),
    testLlmConnection: (provider, apiKey) => electron_1.ipcRenderer.invoke('test-llm-connection', provider, apiKey),
    selectServiceAccount: () => electron_1.ipcRenderer.invoke('select-service-account'),
    // API Key Management
    setGeminiApiKey: (apiKey) => electron_1.ipcRenderer.invoke('set-gemini-api-key', apiKey),
    setGroqApiKey: (apiKey) => electron_1.ipcRenderer.invoke('set-groq-api-key', apiKey),
    setOpenaiApiKey: (apiKey) => electron_1.ipcRenderer.invoke('set-openai-api-key', apiKey),
    setClaudeApiKey: (apiKey) => electron_1.ipcRenderer.invoke('set-claude-api-key', apiKey),
    setNativelyApiKey: (apiKey) => electron_1.ipcRenderer.invoke('set-natively-api-key', apiKey),
    getNativelyUsage: () => electron_1.ipcRenderer.invoke('get-natively-usage'),
    getStoredCredentials: () => electron_1.ipcRenderer.invoke('get-stored-credentials'),
    // Permissions
    checkPermissions: () => electron_1.ipcRenderer.invoke('permissions:check'),
    requestMicPermission: () => electron_1.ipcRenderer.invoke('permissions:request-mic'),
    // Free Trial
    startTrial: () => electron_1.ipcRenderer.invoke('trial:start'),
    getTrialStatus: () => electron_1.ipcRenderer.invoke('trial:status'),
    getLocalTrial: () => electron_1.ipcRenderer.invoke('trial:get-local'),
    convertTrial: (choice) => electron_1.ipcRenderer.invoke('trial:convert', choice),
    endTrialByok: () => electron_1.ipcRenderer.invoke('trial:end-byok'),
    wipeTrialProfileData: () => electron_1.ipcRenderer.invoke('trial:wipe-profile-data'),
    onTrialEnded: (cb) => {
        const sub = (_, data) => cb(data);
        electron_1.ipcRenderer.on('trial-ended', sub);
        return () => electron_1.ipcRenderer.removeListener('trial-ended', sub);
    },
    // STT Provider Management
    setSttProvider: (provider) => electron_1.ipcRenderer.invoke('set-stt-provider', provider),
    getSttProvider: () => electron_1.ipcRenderer.invoke('get-stt-provider'),
    setGroqSttApiKey: (apiKey) => electron_1.ipcRenderer.invoke('set-groq-stt-api-key', apiKey),
    setOpenAiSttApiKey: (apiKey) => electron_1.ipcRenderer.invoke('set-openai-stt-api-key', apiKey),
    setOpenAiSttBaseUrl: (url) => electron_1.ipcRenderer.invoke('set-openai-stt-base-url', url),
    setDeepgramApiKey: (apiKey) => electron_1.ipcRenderer.invoke('set-deepgram-api-key', apiKey),
    setElevenLabsApiKey: (apiKey) => electron_1.ipcRenderer.invoke('set-elevenlabs-api-key', apiKey),
    setAzureApiKey: (apiKey) => electron_1.ipcRenderer.invoke('set-azure-api-key', apiKey),
    setAzureRegion: (region) => electron_1.ipcRenderer.invoke('set-azure-region', region),
    setIbmWatsonApiKey: (apiKey) => electron_1.ipcRenderer.invoke('set-ibmwatson-api-key', apiKey),
    setGroqSttModel: (model) => electron_1.ipcRenderer.invoke('set-groq-stt-model', model),
    setSonioxApiKey: (apiKey) => electron_1.ipcRenderer.invoke('set-soniox-api-key', apiKey),
    setIbmWatsonRegion: (region) => electron_1.ipcRenderer.invoke('set-ibmwatson-region', region),
    testSttConnection: (provider, apiKey, region) => electron_1.ipcRenderer.invoke('test-stt-connection', provider, apiKey, region),
    localWhisperGetModels: () => electron_1.ipcRenderer.invoke('local-whisper-get-models'),
    localWhisperSetModel: (modelId) => electron_1.ipcRenderer.invoke('local-whisper-set-model', modelId),
    localWhisperDeleteModel: (modelId) => electron_1.ipcRenderer.invoke('local-whisper-delete-model', modelId),
    localWhisperStartDownload: (modelId) => electron_1.ipcRenderer.invoke('local-whisper-start-download', modelId),
    onLocalWhisperDownloadProgress: (cb) => {
        const listener = (_, data) => cb(data);
        electron_1.ipcRenderer.on('local-whisper-download-progress', listener);
        return () => electron_1.ipcRenderer.removeListener('local-whisper-download-progress', listener);
    },
    onLocalWhisperDownloadComplete: (cb) => {
        const listener = (_, data) => cb(data);
        electron_1.ipcRenderer.on('local-whisper-download-complete', listener);
        return () => electron_1.ipcRenderer.removeListener('local-whisper-download-complete', listener);
    },
    onLocalWhisperDownloadError: (cb) => {
        const listener = (_, data) => cb(data);
        electron_1.ipcRenderer.on('local-whisper-download-error', listener);
        return () => electron_1.ipcRenderer.removeListener('local-whisper-download-error', listener);
    },
    localWhisperPreload: (modelId) => electron_1.ipcRenderer.invoke('local-whisper-preload', modelId),
    localWhisperGetHardware: () => electron_1.ipcRenderer.invoke('local-whisper-get-hardware'),
    // STT Config Events (Adapted from public PR #173 — verify premium interaction)
    onSttConfigChanged: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('stt-config-changed', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('stt-config-changed', subscription);
        };
    },
    onCredentialsChanged: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on('credentials-changed', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('credentials-changed', subscription);
        };
    },
    // Native Audio Service Events
    onNativeAudioTranscript: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('native-audio-transcript', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('native-audio-transcript', subscription);
        };
    },
    onNativeAudioSuggestion: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('native-audio-suggestion', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('native-audio-suggestion', subscription);
        };
    },
    onNativeAudioConnected: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on('native-audio-connected', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('native-audio-connected', subscription);
        };
    },
    onNativeAudioDisconnected: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on('native-audio-disconnected', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('native-audio-disconnected', subscription);
        };
    },
    onSuggestionGenerated: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('suggestion-generated', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('suggestion-generated', subscription);
        };
    },
    onSuggestionProcessingStart: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on('suggestion-processing-start', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('suggestion-processing-start', subscription);
        };
    },
    onSuggestionError: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('suggestion-error', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('suggestion-error', subscription);
        };
    },
    generateSuggestion: (context, lastQuestion) => electron_1.ipcRenderer.invoke('generate-suggestion', context, lastQuestion),
    getNativeAudioStatus: () => electron_1.ipcRenderer.invoke('native-audio-status'),
    getInputDevices: () => electron_1.ipcRenderer.invoke('get-input-devices'),
    getOutputDevices: () => electron_1.ipcRenderer.invoke('get-output-devices'),
    setRecognitionLanguage: (key) => electron_1.ipcRenderer.invoke('set-recognition-language', key),
    getAiResponseLanguages: () => electron_1.ipcRenderer.invoke('get-ai-response-languages'),
    setAiResponseLanguage: (language) => electron_1.ipcRenderer.invoke('set-ai-response-language', language),
    getSttLanguage: () => electron_1.ipcRenderer.invoke('get-stt-language'),
    getAiResponseLanguage: () => electron_1.ipcRenderer.invoke('get-ai-response-language'),
    onSttLanguageAutoDetected: (callback) => {
        const subscription = (_, bcp47) => callback(bcp47);
        electron_1.ipcRenderer.on('stt-language-auto-detected', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('stt-language-auto-detected', subscription);
        };
    },
    onSystemAudioPermissionDenied: (callback) => {
        const subscription = (_, message) => callback(message);
        electron_1.ipcRenderer.on('system-audio-permission-denied', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('system-audio-permission-denied', subscription);
        };
    },
    onDeviceSelectionApplied: (callback) => {
        const subscription = (_, payload) => callback(payload);
        electron_1.ipcRenderer.on('device-selection-applied', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('device-selection-applied', subscription);
        };
    },
    onAudioCaptureFailed: (callback) => {
        const subscription = (_, payload) => callback(payload);
        electron_1.ipcRenderer.on('audio-capture-failed', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('audio-capture-failed', subscription);
        };
    },
    // STT Status Events
    onSttStatusChanged: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('stt-status', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('stt-status', subscription);
        };
    },
    // Intelligence Mode IPC
    generateAssist: () => electron_1.ipcRenderer.invoke('generate-assist'),
    generateWhatToSay: (question, imagePaths, options) => electron_1.ipcRenderer.invoke('generate-what-to-say', question, imagePaths, options),
    generateClarify: () => electron_1.ipcRenderer.invoke('generate-clarify'),
    generateCodeHint: (imagePaths, problemStatement) => electron_1.ipcRenderer.invoke('generate-code-hint', imagePaths, problemStatement),
    generateBrainstorm: (imagePaths, problemStatement) => electron_1.ipcRenderer.invoke('generate-brainstorm', imagePaths, problemStatement),
    generateFollowUp: (intent, userRequest) => electron_1.ipcRenderer.invoke('generate-follow-up', intent, userRequest),
    generateFollowUpQuestions: () => electron_1.ipcRenderer.invoke('generate-follow-up-questions'),
    generateRecap: () => electron_1.ipcRenderer.invoke('generate-recap'),
    submitManualQuestion: (question) => electron_1.ipcRenderer.invoke('submit-manual-question', question),
    getIntelligenceContext: () => electron_1.ipcRenderer.invoke('get-intelligence-context'),
    testInjectTranscript: (segment) => electron_1.ipcRenderer.invoke('test-inject-transcript', segment),
    testGetModeContext: () => electron_1.ipcRenderer.invoke('test-get-mode-context'),
    resetIntelligence: () => electron_1.ipcRenderer.invoke('reset-intelligence'),
    // Action Button Mode (Dynamic Recap / Brainstorm toggle)
    getActionButtonMode: () => electron_1.ipcRenderer.invoke('get-action-button-mode'),
    setActionButtonMode: (mode) => electron_1.ipcRenderer.invoke('set-action-button-mode', mode),
    onActionButtonModeChanged: (callback) => {
        const subscription = (_, mode) => callback(mode);
        electron_1.ipcRenderer.on('action-button-mode-changed', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('action-button-mode-changed', subscription);
        };
    },
    onModeChanged: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('mode-changed', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('mode-changed', subscription);
        };
    },
    // Meeting Lifecycle
    startMeeting: (metadata) => electron_1.ipcRenderer.invoke('start-meeting', metadata),
    endMeeting: () => electron_1.ipcRenderer.invoke('end-meeting'),
    finalizeMicSTT: () => electron_1.ipcRenderer.invoke('finalize-mic-stt'),
    getRecentMeetings: () => electron_1.ipcRenderer.invoke('get-recent-meetings'),
    getMeetingDetails: (id) => electron_1.ipcRenderer.invoke('get-meeting-details', id),
    updateMeetingTitle: (id, title) => electron_1.ipcRenderer.invoke('update-meeting-title', { id, title }),
    updateMeetingSummary: (id, updates) => electron_1.ipcRenderer.invoke('update-meeting-summary', { id, updates }),
    deleteMeeting: (id) => electron_1.ipcRenderer.invoke('delete-meeting', id),
    onMeetingsUpdated: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on('meetings-updated', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('meetings-updated', subscription);
        };
    },
    // Window Mode
    setWindowMode: (mode, inactive) => electron_1.ipcRenderer.invoke('set-window-mode', mode, inactive),
    // Intelligence Mode Events
    onIntelligenceAssistUpdate: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('intelligence-assist-update', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('intelligence-assist-update', subscription);
        };
    },
    // Phase 3 — Dynamic Action Cards
    onIntelligenceDynamicAction: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('intelligence-dynamic-action', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('intelligence-dynamic-action', subscription);
        };
    },
    acceptDynamicAction: (actionId) => electron_1.ipcRenderer.invoke('dynamic-action:accept', actionId),
    dismissDynamicAction: (actionId) => electron_1.ipcRenderer.invoke('dynamic-action:dismiss', actionId),
    listDynamicActions: () => electron_1.ipcRenderer.invoke('dynamic-action:list'),
    onIntelligenceSuggestedAnswerToken: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('intelligence-suggested-answer-token', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('intelligence-suggested-answer-token', subscription);
        };
    },
    onIntelligenceSuggestedAnswer: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('intelligence-suggested-answer', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('intelligence-suggested-answer', subscription);
        };
    },
    // Sprint 7: dedicated negotiation-coaching channel.
    onIntelligenceNegotiationCoaching: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('intelligence-negotiation-coaching', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('intelligence-negotiation-coaching', subscription);
        };
    },
    // Sprint 9: time-batched IPC token channel.
    onIntelligenceTokenBatch: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('intelligence-token-batch', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('intelligence-token-batch', subscription);
        };
    },
    onIntelligenceRefinedAnswerToken: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('intelligence-refined-answer-token', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('intelligence-refined-answer-token', subscription);
        };
    },
    onIntelligenceRefinedAnswer: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('intelligence-refined-answer', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('intelligence-refined-answer', subscription);
        };
    },
    onIntelligenceRecapToken: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('intelligence-recap-token', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('intelligence-recap-token', subscription);
        };
    },
    onIntelligenceRecap: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('intelligence-recap', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('intelligence-recap', subscription);
        };
    },
    onIntelligenceClarifyToken: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('intelligence-clarify-token', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('intelligence-clarify-token', subscription);
        };
    },
    onIntelligenceClarify: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('intelligence-clarify', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('intelligence-clarify', subscription);
        };
    },
    onIntelligenceFollowUpQuestionsToken: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('intelligence-follow-up-questions-token', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('intelligence-follow-up-questions-token', subscription);
        };
    },
    onIntelligenceFollowUpQuestionsUpdate: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('intelligence-follow-up-questions-update', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('intelligence-follow-up-questions-update', subscription);
        };
    },
    onIntelligenceManualStarted: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on('intelligence-manual-started', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('intelligence-manual-started', subscription);
        };
    },
    onIntelligenceManualResult: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('intelligence-manual-result', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('intelligence-manual-result', subscription);
        };
    },
    onIntelligenceModeChanged: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('intelligence-mode-changed', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('intelligence-mode-changed', subscription);
        };
    },
    onIntelligenceError: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('intelligence-error', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('intelligence-error', subscription);
        };
    },
    onSessionReset: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on('session-reset', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('session-reset', subscription);
        };
    },
    // Streaming Chat
    streamGeminiChat: (message, imagePaths, context, options) => electron_1.ipcRenderer.invoke('gemini-chat-stream', message, imagePaths, context, options),
    onGeminiStreamToken: (callback) => {
        const subscription = (_, token) => callback(token);
        electron_1.ipcRenderer.on('gemini-stream-token', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('gemini-stream-token', subscription);
        };
    },
    onGeminiStreamDone: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on('gemini-stream-done', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('gemini-stream-done', subscription);
        };
    },
    onGeminiStreamError: (callback) => {
        const subscription = (_, error) => callback(error);
        electron_1.ipcRenderer.on('gemini-stream-error', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('gemini-stream-error', subscription);
        };
    },
    // Model Management
    getDefaultModel: () => electron_1.ipcRenderer.invoke('get-default-model'),
    setModel: (modelId) => electron_1.ipcRenderer.invoke('set-model', modelId),
    setDefaultModel: (modelId) => electron_1.ipcRenderer.invoke('set-default-model', modelId),
    toggleModelSelector: (coords) => electron_1.ipcRenderer.invoke('toggle-model-selector', coords),
    modelSelectorCloseIfOpen: () => electron_1.ipcRenderer.invoke('model-selector:close-if-open'),
    forceRestartOllama: () => electron_1.ipcRenderer.invoke('force-restart-ollama'),
    // Settings Window
    toggleSettingsWindow: (coords) => electron_1.ipcRenderer.invoke('toggle-settings-window', coords),
    // Groq Fast Text Mode
    getGroqFastTextMode: () => electron_1.ipcRenderer.invoke('get-groq-fast-text-mode'),
    setGroqFastTextMode: (enabled) => electron_1.ipcRenderer.invoke('set-groq-fast-text-mode', enabled),
    getCodexCliConfig: () => electron_1.ipcRenderer.invoke('get-codex-cli-config'),
    setCodexCliConfig: (config) => electron_1.ipcRenderer.invoke('set-codex-cli-config', config),
    testCodexCli: (config) => electron_1.ipcRenderer.invoke('test-codex-cli', config),
    // Demo
    seedDemo: () => electron_1.ipcRenderer.invoke('seed-demo'),
    // Custom Providers
    saveCustomProvider: (provider) => electron_1.ipcRenderer.invoke('save-custom-provider', provider),
    getCustomProviders: () => electron_1.ipcRenderer.invoke('get-custom-providers'),
    deleteCustomProvider: (id) => electron_1.ipcRenderer.invoke('delete-custom-provider', id),
    // Follow-up Email
    generateFollowupEmail: (input) => electron_1.ipcRenderer.invoke('generate-followup-email', input),
    extractEmailsFromTranscript: (transcript) => electron_1.ipcRenderer.invoke('extract-emails-from-transcript', transcript),
    getCalendarAttendees: (eventId) => electron_1.ipcRenderer.invoke('get-calendar-attendees', eventId),
    openMailto: (params) => electron_1.ipcRenderer.invoke('open-mailto', params),
    // Audio Test
    startAudioTest: (deviceId) => electron_1.ipcRenderer.invoke('start-audio-test', deviceId),
    stopAudioTest: () => electron_1.ipcRenderer.invoke('stop-audio-test'),
    onAudioTestLevel: (callback) => {
        const subscription = (_, level) => callback(level);
        electron_1.ipcRenderer.on('audio-test-level', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('audio-test-level', subscription);
        };
    },
    // Database
    flushDatabase: () => electron_1.ipcRenderer.invoke('flush-database'),
    onUndetectableChanged: (callback) => {
        const subscription = (_, state) => callback(state);
        electron_1.ipcRenderer.on('undetectable-changed', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('undetectable-changed', subscription);
        };
    },
    onOverlayMousePassthroughChanged: (callback) => {
        const subscription = (_, enabled) => callback(enabled);
        electron_1.ipcRenderer.on('overlay-mouse-passthrough-changed', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('overlay-mouse-passthrough-changed', subscription);
        };
    },
    onGroqFastTextChanged: (callback) => {
        const subscription = (_, enabled) => callback(enabled);
        electron_1.ipcRenderer.on('groq-fast-text-changed', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('groq-fast-text-changed', subscription);
        };
    },
    onModelChanged: (callback) => {
        const subscription = (_, modelId) => callback(modelId);
        electron_1.ipcRenderer.on('model-changed', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('model-changed', subscription);
        };
    },
    onOllamaPullProgress: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('ollama:pull-progress', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('ollama:pull-progress', subscription);
        };
    },
    onOllamaPullComplete: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on('ollama:pull-complete', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('ollama:pull-complete', subscription);
        };
    },
    // Theme API
    getThemeMode: () => electron_1.ipcRenderer.invoke('theme:get-mode'),
    setThemeMode: (mode) => electron_1.ipcRenderer.invoke('theme:set-mode', mode),
    onThemeChanged: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('theme:changed', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('theme:changed', subscription);
        };
    },
    // Calendar API
    calendarConnect: () => electron_1.ipcRenderer.invoke('calendar-connect'),
    calendarDisconnect: () => electron_1.ipcRenderer.invoke('calendar-disconnect'),
    getCalendarStatus: () => electron_1.ipcRenderer.invoke('get-calendar-status'),
    getUpcomingEvents: () => electron_1.ipcRenderer.invoke('get-upcoming-events'),
    calendarRefresh: () => electron_1.ipcRenderer.invoke('calendar-refresh'),
    // Auto-Update
    onUpdateAvailable: (callback) => {
        const subscription = (_, info) => callback(info);
        electron_1.ipcRenderer.on('update-available', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('update-available', subscription);
        };
    },
    onUpdateDownloaded: (callback) => {
        const subscription = (_, info) => callback(info);
        electron_1.ipcRenderer.on('update-downloaded', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('update-downloaded', subscription);
        };
    },
    onUpdateChecking: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on('update-checking', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('update-checking', subscription);
        };
    },
    onUpdateNotAvailable: (callback) => {
        const subscription = (_, info) => callback(info);
        electron_1.ipcRenderer.on('update-not-available', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('update-not-available', subscription);
        };
    },
    onUpdateError: (callback) => {
        const subscription = (_, err) => callback(err);
        electron_1.ipcRenderer.on('update-error', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('update-error', subscription);
        };
    },
    onDownloadProgress: (callback) => {
        const subscription = (_, progressObj) => callback(progressObj);
        electron_1.ipcRenderer.on('download-progress', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('download-progress', subscription);
        };
    },
    restartAndInstall: () => electron_1.ipcRenderer.invoke('quit-and-install-update'),
    checkForUpdates: () => electron_1.ipcRenderer.invoke('check-for-updates'),
    downloadUpdate: () => electron_1.ipcRenderer.invoke('download-update'),
    testReleaseFetch: () => electron_1.ipcRenderer.invoke('test-release-fetch'),
    // RAG API
    ragQueryMeeting: (meetingId, query) => electron_1.ipcRenderer.invoke('rag:query-meeting', { meetingId, query }),
    ragQueryLive: (query) => electron_1.ipcRenderer.invoke('rag:query-live', { query }),
    ragQueryGlobal: (query) => electron_1.ipcRenderer.invoke('rag:query-global', { query }),
    ragCancelQuery: (options) => electron_1.ipcRenderer.invoke('rag:cancel-query', options),
    ragIsMeetingProcessed: (meetingId) => electron_1.ipcRenderer.invoke('rag:is-meeting-processed', meetingId),
    ragGetQueueStatus: () => electron_1.ipcRenderer.invoke('rag:get-queue-status'),
    ragRetryEmbeddings: () => electron_1.ipcRenderer.invoke('rag:retry-embeddings'),
    onIncompatibleProviderWarning: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('embedding:incompatible-provider-warning', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('embedding:incompatible-provider-warning', subscription);
        };
    },
    reindexIncompatibleMeetings: () => electron_1.ipcRenderer.invoke('rag:reindex-incompatible-meetings'),
    onRAGStreamChunk: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('rag:stream-chunk', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('rag:stream-chunk', subscription);
        };
    },
    onRAGStreamComplete: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('rag:stream-complete', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('rag:stream-complete', subscription);
        };
    },
    onRAGStreamError: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('rag:stream-error', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('rag:stream-error', subscription);
        };
    },
    // Keybind Management
    getKeybinds: () => electron_1.ipcRenderer.invoke('keybinds:get-all'),
    setKeybind: (id, accelerator) => electron_1.ipcRenderer.invoke('keybinds:set', id, accelerator),
    resetKeybinds: () => electron_1.ipcRenderer.invoke('keybinds:reset'),
    onKeybindsUpdate: (callback) => {
        const subscription = (_, keybinds) => callback(keybinds);
        electron_1.ipcRenderer.on('keybinds:update', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('keybinds:update', subscription);
        };
    },
    onKeybindRegistrationFailed: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('keybinds:registration-failed', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('keybinds:registration-failed', subscription);
        };
    },
    // Global shortcut listener — fired stealthily from main process without focusing the window
    onGlobalShortcut: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('global-shortcut', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('global-shortcut', subscription);
        };
    },
    // Stealth keyboard tap bridge
    stealthTapAvailable: () => electron_1.ipcRenderer.invoke('stealth-tap:available'),
    stealthTapPermissionGranted: () => electron_1.ipcRenderer.invoke('stealth-tap:permission-granted'),
    stealthTapRequestPermission: () => electron_1.ipcRenderer.invoke('stealth-tap:request-permission'),
    stealthTapOpenSettings: () => electron_1.ipcRenderer.invoke('stealth-tap:open-settings'),
    stealthTapIsActive: () => electron_1.ipcRenderer.invoke('stealth-tap:is-active'),
    stealthTapStop: () => electron_1.ipcRenderer.invoke('stealth-tap:stop'),
    stealthTapStart: () => electron_1.ipcRenderer.invoke('stealth-tap:start'),
    stealthTapShouldAutoEngage: () => electron_1.ipcRenderer.invoke('stealth-tap:should-auto-engage'),
    onStealthTapState: (cb) => {
        const sub = (_, state) => cb(state);
        electron_1.ipcRenderer.on('stealth-tap-state', sub);
        return () => {
            electron_1.ipcRenderer.removeListener('stealth-tap-state', sub);
        };
    },
    onStealthKeyCaptured: (cb) => {
        const sub = (_, ev) => cb(ev);
        electron_1.ipcRenderer.on('stealth-key-captured', sub);
        return () => {
            electron_1.ipcRenderer.removeListener('stealth-key-captured', sub);
        };
    },
    // Donation API
    getDonationStatus: () => electron_1.ipcRenderer.invoke('get-donation-status'),
    markDonationToastShown: () => electron_1.ipcRenderer.invoke('mark-donation-toast-shown'),
    setDonationComplete: () => electron_1.ipcRenderer.invoke('set-donation-complete'),
    // Profile Engine API
    profileUploadResume: (filePath) => electron_1.ipcRenderer.invoke('profile:upload-resume', filePath),
    profileGetStatus: () => electron_1.ipcRenderer.invoke('profile:get-status'),
    profileSetMode: (enabled) => electron_1.ipcRenderer.invoke('profile:set-mode', enabled),
    profileDelete: () => electron_1.ipcRenderer.invoke('profile:delete'),
    profileGetProfile: () => electron_1.ipcRenderer.invoke('profile:get-profile'),
    profileSelectFile: () => electron_1.ipcRenderer.invoke('profile:select-file'),
    // JD & Research API
    profileUploadJD: (filePath) => electron_1.ipcRenderer.invoke('profile:upload-jd', filePath),
    profileDeleteJD: () => electron_1.ipcRenderer.invoke('profile:delete-jd'),
    profileResearchCompany: (companyName) => electron_1.ipcRenderer.invoke('profile:research-company', companyName),
    profileGenerateNegotiation: (force) => electron_1.ipcRenderer.invoke('profile:generate-negotiation', force),
    profileGetNegotiationState: () => electron_1.ipcRenderer.invoke('profile:get-negotiation-state'),
    profileResetNegotiation: () => electron_1.ipcRenderer.invoke('profile:reset-negotiation'),
    profileGetNotes: () => electron_1.ipcRenderer.invoke('profile:get-notes'),
    profileSaveNotes: (content) => electron_1.ipcRenderer.invoke('profile:save-notes', content),
    profileGetPersona: () => electron_1.ipcRenderer.invoke('profile:get-persona'),
    profileSavePersona: (content) => electron_1.ipcRenderer.invoke('profile:save-persona', content),
    // Tavily Search API
    setTavilyApiKey: (apiKey) => electron_1.ipcRenderer.invoke('set-tavily-api-key', apiKey),
    // Dynamic Model Discovery
    fetchProviderModels: (provider, apiKey) => electron_1.ipcRenderer.invoke('fetch-provider-models', provider, apiKey),
    setProviderPreferredModel: (provider, modelId) => electron_1.ipcRenderer.invoke('set-provider-preferred-model', provider, modelId),
    // License Management
    licenseActivate: (key) => electron_1.ipcRenderer.invoke('license:activate', key),
    licenseCheckPremium: () => electron_1.ipcRenderer.invoke('license:check-premium'),
    licenseGetDetails: () => electron_1.ipcRenderer.invoke('license:get-details'),
    licenseCheckPremiumAsync: () => electron_1.ipcRenderer.invoke('license:check-premium-async'),
    licenseDeactivate: () => electron_1.ipcRenderer.invoke('license:deactivate'),
    licenseGetHardwareId: () => electron_1.ipcRenderer.invoke('license:get-hardware-id'),
    onLicenseStatusChanged: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('license-status-changed', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('license-status-changed', subscription);
        };
    },
    onModesActiveCleared: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on('modes-active-cleared', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('modes-active-cleared', subscription);
        };
    },
    // Overlay Opacity (Stealth Mode)
    setOverlayOpacity: (opacity) => electron_1.ipcRenderer.invoke('set-overlay-opacity', opacity),
    onOverlayOpacityChanged: (callback) => {
        const subscription = (_, opacity) => callback(opacity);
        electron_1.ipcRenderer.on('overlay-opacity-changed', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('overlay-opacity-changed', subscription);
        };
    },
    // Verbose / Debug Logging
    getVerboseLogging: () => electron_1.ipcRenderer.invoke('get-verbose-logging'),
    setVerboseLogging: (enabled) => electron_1.ipcRenderer.invoke('set-verbose-logging', enabled),
    getMeetingRetention: () => electron_1.ipcRenderer.invoke('get-meeting-retention'),
    setMeetingRetention: (retention) => electron_1.ipcRenderer.invoke('set-meeting-retention', retention),
    onMeetingRetentionChanged: (callback) => {
        const subscription = (_, retention) => callback(retention);
        electron_1.ipcRenderer.on('meeting-retention-changed', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('meeting-retention-changed', subscription);
        };
    },
    getProviderDataScopes: () => electron_1.ipcRenderer.invoke('get-provider-data-scopes'),
    setProviderDataScopes: (scopes) => electron_1.ipcRenderer.invoke('set-provider-data-scopes', scopes),
    onProviderDataScopesChanged: (callback) => {
        const subscription = (_, scopes) => callback(scopes);
        electron_1.ipcRenderer.on('provider-data-scopes-changed', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('provider-data-scopes-changed', subscription);
        };
    },
    getScreenUnderstandingMode: () => electron_1.ipcRenderer.invoke('get-screen-understanding-mode'),
    setScreenUnderstandingMode: (mode) => electron_1.ipcRenderer.invoke('set-screen-understanding-mode', mode),
    onScreenUnderstandingModeChanged: (callback) => {
        const subscription = (_, mode) => callback(mode);
        electron_1.ipcRenderer.on('screen-understanding-mode-changed', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('screen-understanding-mode-changed', subscription);
        };
    },
    getTechnicalInterviewVisionFirst: () => electron_1.ipcRenderer.invoke('get-technical-interview-vision-first'),
    setTechnicalInterviewVisionFirst: (enabled) => electron_1.ipcRenderer.invoke('set-technical-interview-vision-first', enabled),
    onTechnicalInterviewVisionFirstChanged: (callback) => {
        const subscription = (_, enabled) => callback(enabled);
        electron_1.ipcRenderer.on('technical-interview-vision-first-changed', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('technical-interview-vision-first-changed', subscription);
        };
    },
    // Deprecated aliases — kept so renderer builds compiled against the old API keep working.
    getTechnicalInterviewDirectVision: () => electron_1.ipcRenderer.invoke('get-technical-interview-direct-vision'),
    setTechnicalInterviewDirectVision: (enabled) => electron_1.ipcRenderer.invoke('set-technical-interview-direct-vision', enabled),
    onTechnicalInterviewDirectVisionChanged: (callback) => {
        const subscription = (_, enabled) => callback(enabled);
        electron_1.ipcRenderer.on('technical-interview-vision-first-changed', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('technical-interview-vision-first-changed', subscription);
        };
    },
    getLogFilePath: () => electron_1.ipcRenderer.invoke('get-log-file-path'),
    openLogFile: () => electron_1.ipcRenderer.invoke('open-log-file'),
    // Arch
    getArch: () => electron_1.ipcRenderer.invoke('get-arch'),
    getOsVersion: () => electron_1.ipcRenderer.invoke('get-os-version'),
    // Cropper API
    cropperConfirmed: (bounds) => electron_1.ipcRenderer.send('cropper-confirmed', bounds),
    cropperCancelled: () => electron_1.ipcRenderer.send('cropper-cancelled'),
    onResetCropper: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('reset-cropper', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('reset-cropper', subscription);
        };
    },
    // Platform
    platform: process.platform,
    // Modes API
    modesGetAll: () => electron_1.ipcRenderer.invoke('modes:get-all'),
    modesGetActive: () => electron_1.ipcRenderer.invoke('modes:get-active'),
    modesCreate: (params) => electron_1.ipcRenderer.invoke('modes:create', params),
    modesUpdate: (id, updates) => electron_1.ipcRenderer.invoke('modes:update', id, updates),
    modesDelete: (id) => electron_1.ipcRenderer.invoke('modes:delete', id),
    modesSetActive: (id) => electron_1.ipcRenderer.invoke('modes:set-active', id),
    modesGetReferenceFiles: (modeId) => electron_1.ipcRenderer.invoke('modes:get-reference-files', modeId),
    modesUploadReferenceFile: (modeId) => electron_1.ipcRenderer.invoke('modes:upload-reference-file', modeId),
    modesDeleteReferenceFile: (id) => electron_1.ipcRenderer.invoke('modes:delete-reference-file', id),
    modesGetNoteSections: (modeId) => electron_1.ipcRenderer.invoke('modes:get-note-sections', modeId),
    modesAddNoteSection: (modeId, title, description) => electron_1.ipcRenderer.invoke('modes:add-note-section', modeId, title, description),
    modesUpdateNoteSection: (id, updates) => electron_1.ipcRenderer.invoke('modes:update-note-section', id, updates),
    modesDeleteNoteSection: (id) => electron_1.ipcRenderer.invoke('modes:delete-note-section', id),
    modesRemoveAllNoteSections: (modeId) => electron_1.ipcRenderer.invoke('modes:remove-all-note-sections', modeId),
});
// Renderer-side console forwarding to main-process log file.
// When verbose logging is on, patch console.log/warn/error so that renderer
// output appears in ~/Documents/natively_debug.log alongside main-process logs.
(function patchRendererConsole() {
    let _verbose = false;
    const _origLog = console.log.bind(console);
    const _origWarn = console.warn.bind(console);
    const _origError = console.error.bind(console);
    function serialize(...args) {
        return args
            .map((a) => {
            if (a instanceof Error)
                return a.stack || a.message;
            if (typeof a === 'object') {
                try {
                    return JSON.stringify(a);
                }
                catch {
                    return String(a);
                }
            }
            return String(a);
        })
            .join(' ');
    }
    console.log = (...args) => {
        _origLog(...args);
        if (_verbose)
            electron_1.ipcRenderer.send('forward-log-to-file', 'log', serialize(...args));
    };
    console.warn = (...args) => {
        _origWarn(...args);
        if (_verbose)
            electron_1.ipcRenderer.send('forward-log-to-file', 'warn', serialize(...args));
    };
    console.error = (...args) => {
        _origError(...args);
        if (_verbose)
            electron_1.ipcRenderer.send('forward-log-to-file', 'error', serialize(...args));
    };
    // Sync verbose flag from main process at startup
    electron_1.ipcRenderer
        .invoke('get-verbose-logging')
        .then((v) => {
        _verbose = v;
    })
        .catch(() => { });
    // Keep flag in sync when the user toggles verbose in settings
    electron_1.ipcRenderer.on('verbose-logging-changed', (_event, enabled) => {
        _verbose = enabled;
    });
})();
//# sourceMappingURL=preload.js.map
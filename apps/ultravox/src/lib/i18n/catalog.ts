/**
 * Typed message catalog for English + German.
 *
 * Why a custom typed catalog instead of react-i18next:
 *  - 2 (eventually 4–5) languages, ~250 strings — react-i18next's lazy
 *    loading / namespace machinery is overkill for that scale.
 *  - TypeScript fails the build when a key is missing in any language.
 *    react-i18next silently falls back to the default lang at runtime,
 *    masking missing translations until a user-facing bug report.
 *  - Zero new deps; zero bundle bloat.
 *
 * Adding a third language (Swedish, Spanish, etc.) is a one-step change:
 * append a new key to `Lang` and a parallel object inside `CATALOG`.
 * TypeScript will then fail the build at every key the new language
 * is missing — the loop-until-green property the user asked for.
 *
 * What's NOT in this catalog (intentional):
 *  - LLM cleanup template bodies (cleanupTemplates.ts) — those drive
 *    AI output quality and English instructions follow more reliably
 *    across Sonnet / Haiku / GPT-4o / local Llama variants.
 *  - Mode systemPrompt fields (voiceModes.ts) — same reason.
 *  - Console.log / debug log strings — diagnostic, English helps when
 *    sharing logs with maintainers.
 *  - Identifiers, file paths, mime types, codes.
 *  - Numeric units like "MB" / "GB" — universal.
 */

export type Lang = "en" | "de" | "es" | "sv";

export const LANGS: ReadonlyArray<Lang> = ["en", "de", "es", "sv"] as const;

export interface MessageCatalog {
  /** Common buttons and actions reused across panels. */
  common: {
    back: string;
    cancel: string;
    confirm: string;
    save: string;
    delete: string;
    deleteConfirm: string;
    copy: string;
    copied: string;
    close: string;
    open: string;
    next: string;
    skip: string;
    continueLabel: string;
    refresh: string;
    settings: string;
    granted: string;
    denied: string;
    notYet: string;
    on: string;
    off: string;
    loading: string;
  };
  /** Tray menu items + Apple-menu app submenu items. */
  tray: {
    toggleRecord: string;
    copyLastTranscription: string;
    settingsItem: string;
    micSettings: string;
    micOpenSystemSettings: string;
    micDefault: string;
    axSettings: string;
    modeMenu: string;
    quit: string;
    versionLabel: (version: string) => string;
  };
  /** macOS application menu (the "Ultravox" submenu). */
  appMenu: {
    about: string;
    copyLastTranscription: string;
    hide: string;
    hideOthers: string;
    showAll: string;
    quit: string;
    edit: string;
    undo: string;
    redo: string;
    cut: string;
    copy: string;
    paste: string;
    selectAll: string;
  };
  /** Page header / breadcrumbs in Settings. */
  breadcrumbs: {
    home: string;
    modes: string;
    vocabulary: string;
    configuration: string;
    sound: string;
    history: string;
  };
  panels: {
    home: {
      sectionVoice: string;
      navModes: string;
      navVocabulary: string;
      navSound: string;
      sectionRecording: string;
      hotkeyHelp: string;
      recordToggle: string;
      modeSwitcher: string;
      pushToTalk: string;
      pushToTalkHelp: string;
      pushToTalkPlaceholder: string;
      recordingStyleLabel: string;
      recordingStyleToggle: string;
      recordingStylePtt: string;
      pttHotkeyLabel: string;
      sectionAppearance: string;
      themeLabel: string;
      themeLight: string;
      themeDark: string;
      themeAuto: string;
      themeOcean: string;
      themeNight: string;
      sectionApp: string;
      navConfiguration: string;
      navHistory: string;
      lastTranscriptionLabel: string;
      lastTranscriptionHelp: string;
    };
    configuration: {
      sectionAboutYou: string;
      sectionAboutYouHelp: string;
      firstName: string;
      lastName: string;
      sectionCleanupBackends: string;
      sectionCleanupBackendsHelp: string;
      claudeCodeCli: string;
      claudeCodeCliInstall: string;
      claudeCodeCliDetected: (path: string) => string;
      claudeCodeCliChecking: string;
      claudeCodeCliAvailable: (version: string) => string;
      claudeCodeCliNotInstalled: string;
      sectionOnboarding: string;
      sectionOnboardingHelp: string;
      launchOnboarding: string;
      diagnosticsFooter: (n: number) => string;
      diagnosticsConfirmAgain: string;
      diagnosticsEmpty: string;
      installedWhisperEmpty: string;
      installedLlmHeader: string;
      installedLlmEmpty: string;
      deleteModelTitle: string;
      coremlAneBadgeTitle: string;
      sectionRecordingWindow: string;
      sectionRecordingWindowHelp: string;
      pillStyleLabel: string;
      sectionModeSelection: string;
      sectionModeSelectionHelp: string;
      autoModeLabel: string;
      autoModeHelp: string;
      sectionTranscription: string;
      sectionPermissions: string;
      sectionPermissionsHelp: string;
      micAccess: string;
      micGrantedHelp: string;
      micDeniedHelp: string;
      micPromptHelp: string;
      micCheckingHelp: string;
      grantAccess: string;
      axAccess: string;
      axGrantedHelp: string;
      axIdleHelp: string;
      axRequestingHelp: string;
      sectionRecordings: string;
      sectionRecordingsHelp: string;
      saveAudioLocally: string;
      saveAudioOnHelp: (retentionLabel: string) => string;
      saveAudioOffHelp: string;
      folderLabel: string;
      folderDefaultHelp: string;
      folderCustomHelp: string;
      folderChoose: string;
      folderReset: string;
      sectionLanguage: string;
      sectionLanguageHelp: string;
      languageLabel: string;
      toggleOffTitle: string;
      toggleOffBody: (count: number, size: string) => string;
      toggleOffDelete: string;
      toggleOffKeep: string;
      sectionLastTranscription: string;
      sectionLastTranscriptionHelp: string;
      cacheModeLabel: string;
      cacheModeHelp: string;
      cacheModeAutoCopy: string;
      cacheModeCacheOnly: string;
      cacheModeNoCache: string;
      showRecordingsButton: string;
      autoDeleteAfter: string;
      retentionNever: string;
      retentionDays: (days: number) => string;
      diskUsage: string;
      diskUsageEmpty: string;
      diskUsageFull: (size: string) => string;
      openFolder: string;
      deleteAll: (count: number) => string;
      deleteAllConfirm: string;
      sectionDiagnostics: string;
      sectionDiagnosticsHelp: string;
      clearLog: string;
      sectionDangerZone: string;
      resetAll: string;
      resetAllConfirm: string;
      resetAllHelp: string;
    };
    modes: {
      sectionRunOnDevice: string;
      enableLocalTranscription: string;
      enableLocalTranscriptionHelp: string;
      enableLocalCleanup: string;
      enableLocalCleanupHelp: string;
      sectionActiveMode: string;
      addMode: string;
      noModes: string;
      unsavedTitle: string;
      unsavedBody: string;
      unsavedSave: string;
      unsavedDiscard: string;
      downloadModelTitle: string;
      downloadModelBody: (label: string, size: string) => string;
      downloadModelDownload: string;
      downloadModelUseCloud: string;
      dragHandleTitle: string;
      duplicateTitle: string;
      duplicateAriaLabel: (name: string) => string;
      newMode: string;
      newModeCopy: (name: string) => string;
      configureMode: (name: string) => string;
      // v0.19.0 per-mode auto-switching UI:
      autoModeAppsLabel: string;
      autoModeAppsHelp: (modeName: string) => string;
      autoModeAppsEmpty: string;
      autoModeAppsAdd: string;
      autoModeAppsRemove: (appName: string) => string;
      autoModeAppsPickerTitle: (modeName: string) => string;
    };
    sound: {
      roundTripTest: string;
      roundTripTestHelp: string;
      testRecordIdle: string;
      testRecordRecording: string;
      testRecordTranscribing: string;
      compareIdle: string;
      compareRecording: string;
      compareRunning: string;
      compareRunAgain: string;
      compareWhisperRaw: string;
      sectionMicrophone: string;
      sectionMicrophoneHelp: string;
      sectionCompare: string;
      sectionCompareHelp: string;
      sectionInputProcessing: string;
      autoGain: string;
      autoGainHelp: string;
      noiseSuppression: string;
      noiseSuppressionHelp: string;
      silenceRemoval: string;
      silenceRemovalHelp: string;
      sectionSoundEffects: string;
      pauseMusic: string;
      pauseMusicHelp: string;
      duckMusic: string;
      duckMusicHelp: string;
      duckingDepth: string;
      duckSubtle: string;
      duckBalanced: string;
      duckStrong: string;
      /** Hover tooltip on each segment. `pct` is the user-selected
       *  ducking amount (30/50/70). Body should describe the EFFECT,
       *  not just restate the percentage. */
      duckTooltip: (pct: number) => string;
      chime: string;
      chimeHelp: string;
      chimeVolume: string;
      chimeTest: string;
      chimeTestStart: string;
      chimeTestStop: string;
    };
    vocabulary: {
      title: string;
      help: string;
      addEntry: string;
      sourceLabel: string;
      replacementLabel: string;
      empty: string;
    };
    history: {
      sectionTitle: (count: number) => string;
      clearAll: string;
      empty: string;
      audioBadgeTitle: (size: string) => string;
      deleteAudio: string;
      footnoteAudio: (count: number) => string;
      footnoteNoAudio: string;
      footnoteCap: string;
      timeJustNow: string;
      timeMinutesAgo: (n: number) => string;
      timeHoursAgo: (n: number) => string;
      timeDaysAgo: (n: number) => string;
      clickToCopy: string;
      expand: string;
      collapse: string;
    };
  };
  pill: {
    discardConfirm: string;
    discardKeepHint: string;
    discardConfirmHint: string;
    transcribing: string;
    silenceClosing: string;
    error: string;
    dismiss: string;
    noSpeech: string;
    nothingToTranscribe: string;
    micDenied: string;
    micNotFound: string;
    couldntStart: string;
    pasteFailed: (msg: string) => string;
    invalidConstraint: string;
    silentDescription: string;
  };
  modeOverlay: {
    title: string;
    hint: string;
  };
  confirmDialog: {
    confirm: string;
    cancel: string;
  };
  pillStylePicker: {
    classicLabel: string;
    classicDescription: string;
    miniLabel: string;
    miniDescription: string;
  };
  errors: {
    generic: string;
  };
}

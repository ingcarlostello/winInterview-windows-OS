import type { Language } from "../stores/interview";

export type TranslationKey =
  | "statusDisconnected"
  | "statusReady"
  | "statusListening"
  | "statusThinking"
  | "statusResponding"
  | "statusPaused"
  | "statusReconnecting"
  | "statusCapturing"
  | "btnListen"
  | "btnConnecting"
  | "btnResume"
  | "btnPause"
  | "btnEnd"
  | "interviewer"
  | "placeholderAudio"
  | "aiCopilot"
  | "btnCopy"
  | "generatingResponse"
  | "placeholderResponse"
  | "questionSingular"
  | "questionPlural"
  | "customContext"
  | "placeholderPrompt"
  | "btnSave"
  | "btnRestoreDefault"
  | "promptSaved"
  | "promptRestored"
  | "btnTogglePrompt"
  | "activePromptIndicator"
  | "ghostModeOn"
  | "ghostModeOff"
  | "contentProtected"
  | "contentUnprotected"
  | "screenReader"
  | "captureAgain"
  | "clearScreen"
  | "captureScreen"
  | "capturing"
  | "solution"
  | "noScreenCapture"
  | "screenCaptureDescription"
  | "screenCaptureButton"
  | "promptForLLM"
  | "analyzeScreens"
  | "analyzing"
  | "captureLimitReached"
  | "analysesRemaining"
  | "analysesQuotaExceeded"
  | "promptPlaceholder"
  | "themeGlass"
  | "ghostModeInvisibleOn"
  | "ghostModeInvisibleOff"
  | "alwaysOnTopOn"
  | "alwaysOnTopOff"
  | "waitingQuestion"
  | "pressListenToStart"
  | "copilotReady"
  | "copilotReadyDesc"
  | "charsBadge"
  | "badgeReady"
  | "badgeListening"
  | "badgeThinking"
  | "badgeResponding"
  | "quotaExceeded"
  | "capturesRemaining"
  | "quotaExhausted"
  | "quotaExhaustedTooltip"
  | "timeRemaining"
  | "sessionTimeTooltip"
  | "pricingTitle"
  | "pricingSubtitle"
  | "btnSubscribe"
  | "btnCurrentPlan"
  | "btnManage"
  | "btnCancelSub"
  | "btnUpdatePayment"
  | "checkoutRedirecting"
  | "checkoutError"
  | "perMonth"
  | "freeTierDesc"
  | "freeTrialFeatures"
  | "planFree"
  | "planLite"
  | "planPro"
  | "planUltra"
  | "featRealTime"
  | "featStreaming"
  | "featAlwaysOnTop"
  | "featCustomPrompts"
  | "featSimCaptures"
  | "featSimAnalysis"
  | "featShortcuts"
  | "featInvisible"
  | "featGhost"
  | "quotaCaptures"
  | "quotaAnalyses"
  | "quotaTranscription"
  | "subActive"
  | "subCanceled"
  | "subPastDue"
  | "subPaused"
  | "subStatus"
  | "closeModal"
  | "authLoading"
  | "authError"
  | "authErrorDesc"
  | "btnRetry"
  | "btnLogout"
  | "upgradeSuccess"
  | "upgradeFallback"
  | "thinkingMode"
  | "audioSourceLabel"
  | "audioSourceMic"
  | "audioSourceSystem"
  | "audioSourceBoth"
  | "audioSourceMicDesc"
  | "audioSourceSystemDesc"
  | "audioSourceBothDesc"
  | "audioSourceUltraTooltip"
  | "audioSourceMicHint"
  | "keyLoginLabel"
  | "keyLoginSubmit"
  | "keyLoginInvalid"
  | "keyLoginTitle"
  | "keyLoginSubtitle"
  | "keyLoginVerifying"
  | "keyLoginNotFound"
  | "keyLoginError"
  | "updateReady"
  | "updateDownloading"
  | "updateRestartNow"
  | "updateLater";

const translations: Record<Language, Record<TranslationKey, string>> = {
  es: {
    statusDisconnected: "Desconectado",
    statusReady: "Listo",
    statusListening: "Escuchando",
    statusThinking: "Pensando...",
    statusResponding: "Respondiendo",
    statusPaused: "Pausado",
    statusReconnecting: "Reconectando...",
    statusCapturing: "Capturando...",
    btnListen: "Escuchar",
    btnConnecting: "Conectando...",
    btnResume: "Reanudar",
    btnPause: "Pausar",
    btnEnd: "Finalizar",
    interviewer: "Entrevistador",
    placeholderAudio: "Inicia para capturar audio",
    aiCopilot: "Copiloto IA",
    btnCopy: "Copiar",
    generatingResponse: "Generando respuesta...",
    placeholderResponse: "La respuesta aparecerá aquí",
    questionSingular: "1 pregunta respondida",
    questionPlural: "{count} preguntas respondidas",
    customContext: "Contexto Personalizado",
    placeholderPrompt: "Ej: Responde en máximo 5 líneas + 3 puntos clave con viñetas (-). Sé conciso y técnico.",
    btnSave: "Guardar",
    btnRestoreDefault: "Restaurar default",
    promptSaved: "Prompt guardado",
    promptRestored: "Prompt restaurado",
    btnTogglePrompt: "Editar prompt",
    activePromptIndicator: "✓ Prompt activo",
    ghostModeOn: "👻 Ghost",
    ghostModeOff: "Ghost off",
    contentProtected: "Invisible",
    contentUnprotected: "Visible",
    screenReader: "Lector de Pantalla",
    captureAgain: "Capturar de nuevo",
    clearScreen: "✕ Limpiar",
    captureScreen: "Capturar pantalla",
    capturing: "Capturando...",
    solution: "Solución",
    noScreenCapture: "Captura una pantalla para analizar",
    screenCaptureDescription:
      "El analizador detectará diagramas, código y whiteboards que el entrevistador comparta.",
    screenCaptureButton: "Capturar pantalla",
    promptForLLM: "PROMPT PARA EL LLM",
    analyzeScreens: "Analizar capturas",
    analyzing: "Analizando...",
    captureLimitReached: "Límite de {count} capturas alcanzado",
    analysesRemaining: "análisis restantes este mes",
    analysesQuotaExceeded: "Cuota de análisis agotada.",
    themeGlass: "Glass",
    ghostModeInvisibleOn: "INVISIBLE: ON",
    ghostModeInvisibleOff: "INVISIBLE: OFF",
    alwaysOnTopOn: "Fijado",
    alwaysOnTopOff: "No fijado",
    promptPlaceholder:
      "Analiza la captura de pantalla y resuelve el problema técnico mostrado paso a paso, explicando la lógica.",
    waitingQuestion: "Esperando pregunta del entrevistador",
    pressListenToStart: "PRESIONA ESCUCHAR PARA COMENZAR",
    copilotReady: "El copiloto está listo",
    copilotReadyDesc: "Cuando detecte una pregunta, generará una respuesta estructurada con código y explicación en menos de 2 segundos.",
    charsBadge: "{count} CHARS",
    badgeReady: "LISTO",
    badgeListening: "ESCUCHANDO",
    badgeThinking: "PENSANDO",
    badgeResponding: "RESPONDIENDO",
    quotaExceeded: "Cuota agotada. Mejora tu plan.",
    capturesRemaining: "capturas restantes este mes",
    quotaExhausted: "Cuota agotada - Actualizar",
    quotaExhaustedTooltip: "Has usado todos tus minutos de transcripción. Actualiza tu plan para continuar.",
    timeRemaining: "{count}m restantes",
    sessionTimeTooltip: "Tiempo de sesión transcurrido",
    pricingTitle: "Planes",
    pricingSubtitle: "Elige el plan que se ajuste a tus necesidades",
    btnSubscribe: "Suscribirse",
    btnCurrentPlan: "Plan actual",
    btnManage: "Gestionar",
    btnCancelSub: "Cancelar suscripción",
    btnUpdatePayment: "Actualizar pago",
    checkoutRedirecting: "Redirigiendo al checkout...",
    checkoutError: "Error al iniciar el checkout",
    perMonth: "/mes",
    freeTierDesc: "Plan gratuito",
    freeTrialFeatures: "Prueba: 3 min transcripción + 1 captura + 1 análisis",
    planFree: "Free",
    planLite: "Lite",
    planPro: "Pro",
    planUltra: "Ultra",
    featRealTime: "Transcripción en tiempo real",
    featStreaming: "Respuestas en streaming",
    featAlwaysOnTop: "Siempre on top",
    featCustomPrompts: "Custom prompts",
    featSimCaptures: "Capturas simultáneas",
    featSimAnalysis: "Análisis simultáneos",
    featShortcuts: "Atajos del teclado",
    featInvisible: "Modo invisible",
    featGhost: "Modo Fantasma (click-through)",
    quotaCaptures: "{count} capturas/mes",
    quotaAnalyses: "{count} análisis/mes",
    quotaTranscription: "{count} min de conversación/mes",
    subActive: "Activa",
    subCanceled: "Cancelada",
    subPastDue: "Pago pendiente",
    subPaused: "Pausada",
    subStatus: "Estado de suscripción",
    closeModal: "Cerrar",
    authLoading: "Cargando...",
    authError: "Error de conexión",
    authErrorDesc: "No se pudo conectar con el servicio de autenticación. Verifica tu conexión e inténtalo de nuevo.",
    btnRetry: "Reintentar",
    btnLogout: "Cerrar sesión",
    upgradeSuccess: "¡Suscripción activada! Tu plan {plan} está listo.",
    upgradeFallback: "Si completaste tu compra y no ves los cambios, cierra sesión y vuelve a iniciar sesión.",
    thinkingMode: "Modo pensamiento",
    audioSourceLabel: "Fuente de audio",
    audioSourceMic: "Micrófono",
    audioSourceSystem: "Audio del sistema",
    audioSourceBoth: "Ambos",
    audioSourceMicDesc: "Te capta a ti. Requiere altavoz (no audífonos) para oír al entrevistador.",
    audioSourceSystemDesc: "Capta al entrevistador aunque uses audífonos. Recomendado.",
    audioSourceBothDesc: "Micrófono + audio del sistema mezclados en un solo canal.",
    audioSourceUltraTooltip: "Captura de audio del sistema disponible en Ultra",
    audioSourceMicHint: "🎧 Modo micrófono: usa altavoz (no audífonos) para captar al entrevistador. Mejora a Ultra para capturar el audio del sistema.",
    keyLoginLabel: "Clave de acceso",
    keyLoginSubmit: "Entrar",
    keyLoginInvalid: "Clave inválida (debe empezar con wik_).",
    keyLoginTitle: "Inicia sesión",
    keyLoginSubtitle: "Pega la clave de acceso de tu cuenta para continuar",
    keyLoginVerifying: "Verificando...",
    keyLoginNotFound: "Clave no encontrada. Verifica que sea la del entorno correcto (dev/prod).",
    keyLoginError: "No se pudo verificar la clave. Revisa tu conexión.",
    updateReady: "Actualización {version} lista",
    updateDownloading: "Descargando actualización {version}…",
    updateRestartNow: "Reiniciar ahora",
    updateLater: "Después",
  },
  en: {
    statusDisconnected: "Disconnected",
    statusReady: "Ready",
    statusListening: "Listening",
    statusThinking: "Thinking...",
    statusResponding: "Responding",
    statusPaused: "Paused",
    statusReconnecting: "Reconnecting...",
    statusCapturing: "Capturing...",
    btnListen: "Listen",
    btnConnecting: "Connecting...",
    btnResume: "Resume",
    btnPause: "Pause",
    btnEnd: "End",
    interviewer: "Interviewer",
    placeholderAudio: "Start to capture audio",
    aiCopilot: "AI Copilot",
    btnCopy: "Copy",
    generatingResponse: "Generating response...",
    placeholderResponse: "Response will appear here",
    questionSingular: "1 question answered",
    questionPlural: "{count} questions answered",
    customContext: "Custom Context",
    placeholderPrompt: "E.g: Answer in max 5 lines + 3 bullet points (-). Be concise and technical.",
    btnSave: "Save",
    btnRestoreDefault: "Restore default",
    promptSaved: "Prompt saved",
    promptRestored: "Prompt restored",
    btnTogglePrompt: "Edit prompt",
    activePromptIndicator: "✓ Active prompt",
    ghostModeOn: "👻 Ghost",
    ghostModeOff: "Ghost off",
    contentProtected: "Invisible",
    contentUnprotected: "Visible",
    screenReader: "Screen Reader",
    captureAgain: "Capture again",
    clearScreen: "✕ Clear",
    captureScreen: "Capture screen",
    capturing: "Capturing...",
    solution: "Solution",
    noScreenCapture: "Capture a screen to analyze",
    screenCaptureDescription:
      "The analyzer will detect diagrams, code and whiteboards shared by the interviewer.",
    screenCaptureButton: "Capture screen",
    promptForLLM: "PROMPT FOR THE LLM",
    analyzeScreens: "Analyze captures",
    analyzing: "Analyzing...",
    captureLimitReached: "Limit of {count} captures reached",
    analysesRemaining: "analyses remaining this month",
    analysesQuotaExceeded: "Analysis quota exhausted.",
    themeGlass: "Glass",
    ghostModeInvisibleOn: "INVISIBLE: ON",
    ghostModeInvisibleOff: "INVISIBLE: OFF",
    alwaysOnTopOn: "Pinned",
    alwaysOnTopOff: "Unpinned",
    promptPlaceholder:
      "Analyze the screenshot and solve the technical problem shown step by step, explaining the logic.",
    waitingQuestion: "Waiting for interviewer question",
    pressListenToStart: "PRESS LISTEN TO START",
    copilotReady: "The copilot is ready",
    copilotReadyDesc: "When it detects a question, it will generate a structured response with code and explanation in less than 2 seconds.",
    charsBadge: "{count} CHARS",
    badgeReady: "READY",
    badgeListening: "LISTENING",
    badgeThinking: "THINKING",
    badgeResponding: "RESPONDING",
    quotaExceeded: "Quota exceeded. Upgrade your plan.",
    capturesRemaining: "captures remaining this month",
    quotaExhausted: "Quota exhausted - Upgrade",
    quotaExhaustedTooltip: "You've used all your transcription minutes. Upgrade your plan to continue.",
    timeRemaining: "{count}m left",
    sessionTimeTooltip: "Session time elapsed",
    pricingTitle: "Plans",
    pricingSubtitle: "Choose the plan that fits your needs",
    btnSubscribe: "Subscribe",
    btnCurrentPlan: "Current plan",
    btnManage: "Manage",
    btnCancelSub: "Cancel subscription",
    btnUpdatePayment: "Update payment",
    checkoutRedirecting: "Redirecting to checkout...",
    checkoutError: "Error starting checkout",
    perMonth: "/mo",
    freeTierDesc: "Free plan",
    freeTrialFeatures: "Trial: 3 min transcription + 1 capture + 1 analysis",
    planFree: "Free",
    planLite: "Lite",
    planPro: "Pro",
    planUltra: "Ultra",
    featRealTime: "Real-time transcription",
    featStreaming: "Streaming responses",
    featAlwaysOnTop: "Always on top",
    featCustomPrompts: "Custom prompts",
    featSimCaptures: "Simultaneous captures",
    featSimAnalysis: "Simultaneous analysis",
    featShortcuts: "Keyboard shortcuts",
    featInvisible: "Invisible mode",
    featGhost: "Ghost mode (click-through)",
    quotaCaptures: "{count} captures/mo",
    quotaAnalyses: "{count} analyses/mo",
    quotaTranscription: "{count} min conversation/mo",
    subActive: "Active",
    subCanceled: "Canceled",
    subPastDue: "Payment pending",
    subPaused: "Paused",
    subStatus: "Subscription status",
    closeModal: "Close",
    authLoading: "Loading...",
    authError: "Connection error",
    authErrorDesc: "Could not connect to the authentication service. Check your connection and try again.",
    btnRetry: "Retry",
    btnLogout: "Sign out",
    upgradeSuccess: "Subscription activated! Your {plan} plan is ready.",
    upgradeFallback: "If you completed your purchase and don't see changes, sign out and sign back in.",
    thinkingMode: "Thinking mode",
    audioSourceLabel: "Audio source",
    audioSourceMic: "Microphone",
    audioSourceSystem: "System audio",
    audioSourceBoth: "Both",
    audioSourceMicDesc: "Captures you. Requires a speaker (not headphones) to hear the interviewer.",
    audioSourceSystemDesc: "Captures the interviewer even with headphones on. Recommended.",
    audioSourceBothDesc: "Microphone + system audio mixed into a single channel.",
    audioSourceUltraTooltip: "System audio capture available on Ultra",
    audioSourceMicHint: "🎧 Microphone mode: use a speaker (not headphones) to capture the interviewer. Upgrade to Ultra to capture system audio.",
    keyLoginLabel: "Access key",
    keyLoginSubmit: "Enter",
    keyLoginInvalid: "Invalid key (must start with wik_).",
    keyLoginTitle: "Sign in",
    keyLoginSubtitle: "Paste your account access key to continue",
    keyLoginVerifying: "Verifying...",
    keyLoginNotFound: "Key not found. Make sure it matches the current environment (dev/prod).",
    keyLoginError: "Couldn't verify the key. Check your connection.",
    updateReady: "Update {version} ready",
    updateDownloading: "Downloading update {version}…",
    updateRestartNow: "Restart now",
    updateLater: "Later",
  },
};

export function t(key: TranslationKey, language: Language, params?: Record<string, string | number>): string {
  let value = translations[language][key];
  if (params) {
    for (const [paramKey, paramValue] of Object.entries(params)) {
      value = value.replace(`{${paramKey}}`, String(paramValue));
    }
  }
  return value;
}

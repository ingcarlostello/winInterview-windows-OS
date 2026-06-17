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
  | "capturesRemaining";

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
    captureLimitReached: "Límite de 4 capturas alcanzado",
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
    captureLimitReached: "Limit of 4 captures reached",
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

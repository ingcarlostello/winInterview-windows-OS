import type { Language } from "../stores/interview";

export type TranslationKey =
  | "statusDisconnected"
  | "statusReady"
  | "statusListening"
  | "statusThinking"
  | "statusResponding"
  | "statusPaused"
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
  | "btnTogglePrompt";

const translations: Record<Language, Record<TranslationKey, string>> = {
  es: {
    statusDisconnected: "Desconectado",
    statusReady: "Listo",
    statusListening: "Escuchando",
    statusThinking: "Pensando...",
    statusResponding: "Respondiendo",
    statusPaused: "Pausado",
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
    placeholderPrompt: "Ej: Soy desarrollador senior con 5 años en React, postulando a una empresa de fintech. Responde de forma concisa y técnica.",
    btnSave: "Guardar",
    btnRestoreDefault: "Restaurar default",
    promptSaved: "Prompt guardado",
    promptRestored: "Prompt restaurado",
    btnTogglePrompt: "Editar prompt",
  },
  en: {
    statusDisconnected: "Disconnected",
    statusReady: "Ready",
    statusListening: "Listening",
    statusThinking: "Thinking...",
    statusResponding: "Responding",
    statusPaused: "Paused",
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
    placeholderPrompt: "E.g: I'm a senior developer with 5 years in React, applying to a fintech company. Respond concisely and technically.",
    btnSave: "Save",
    btnRestoreDefault: "Restore default",
    promptSaved: "Prompt saved",
    promptRestored: "Prompt restored",
    btnTogglePrompt: "Edit prompt",
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

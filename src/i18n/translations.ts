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
  | "questionPlural";

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

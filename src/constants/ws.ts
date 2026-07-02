export const WS_MESSAGE_TYPE = {
  STATUS: "status",
  TRANSCRIPTION: "transcription",
  CHUNK: "chunk",
  ERROR: "error",
  PLAN_INFO: "plan_info",
  QUOTA_UPDATE: "quota_update",
} as const;

export const WS_STATUS = {
  CONNECTED: "connected",
  LISTENING: "listening",
  THINKING: "thinking",
  RESPONDING: "responding",
  PAUSED: "paused",
  RECONNECTING: "reconnecting",
  CLEARED: "cleared",
  CAPTURING: "capturing",
  COMPLETED: "completed",
  PROMPT_SAVED: "prompt_saved",
  PROMPT_CLEARED: "prompt_cleared",
  QUOTA_EXCEEDED: "quota_exceeded",
  FEATURE_BLOCKED: "feature_blocked",
} as const;

export type WsMessageType = (typeof WS_MESSAGE_TYPE)[keyof typeof WS_MESSAGE_TYPE];
export type WsStatus = (typeof WS_STATUS)[keyof typeof WS_STATUS];

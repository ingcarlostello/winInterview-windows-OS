export type PlanId = "free" | "lite" | "pro" | "ultra";

export const PLAN_QUOTAS: Record<PlanId, { transcriptionSeconds: number; captures: number; analyses: number }> = {
  free: { transcriptionSeconds: 180, captures: 1, analyses: 1 },
  lite: { transcriptionSeconds: 1200, captures: 2, analyses: 2 },
  pro: { transcriptionSeconds: 7200, captures: 8, analyses: 8 },
  ultra: { transcriptionSeconds: 28800, captures: 40, analyses: 40 },
};

export const PLAN_FEATURES: Record<PlanId, string[]> = {
  free: [],
  lite: [],
  pro: ["custom_prompts", "simultaneous_captures", "simultaneous_analysis", "keyboard_shortcuts"],
  ultra: ["custom_prompts", "simultaneous_captures", "simultaneous_analysis", "keyboard_shortcuts", "invisible_mode", "ghost_mode", "thinking_mode", "system_audio_capture", "simultaneous_audio"],
};

export const PLAN_NAMES: Record<PlanId, string> = {
  free: "Free",
  lite: "Lite",
  pro: "Pro",
  ultra: "Ultra",
};

export const PLAN_PRICES_USD: Record<Exclude<PlanId, "free">, number> = {
  lite: 4.99,
  pro: 19.99,
  ultra: 59.99,
};

// Orden de los planes. Decide si un cambio es upgrade (sube de rango → inmediato con
// prorrateo) o downgrade (baja de rango → al final del ciclo). Espejo en el frontend
// (src/constants/pricing.constants.ts).
export const PLAN_RANK: Record<PlanId, number> = {
  free: 0,
  lite: 1,
  pro: 2,
  ultra: 3,
};

export type PlanId = "lite" | "pro" | "ultra";

export const PLAN_QUOTAS: Record<PlanId, { transcriptionSeconds: number; captures: number; analyses: number }> = {
  lite: { transcriptionSeconds: 1200, captures: 2, analyses: 2 },
  pro: { transcriptionSeconds: 7200, captures: 8, analyses: 8 },
  ultra: { transcriptionSeconds: 28800, captures: 40, analyses: 40 },
};

export const PLAN_FEATURES: Record<PlanId, string[]> = {
  lite: [],
  pro: ["custom_prompts", "simultaneous_captures", "simultaneous_analysis", "keyboard_shortcuts"],
  ultra: ["custom_prompts", "simultaneous_captures", "simultaneous_analysis", "keyboard_shortcuts", "invisible_mode", "ghost_mode"],
};

export const PLAN_NAMES: Record<PlanId, string> = {
  lite: "Lite",
  pro: "Pro",
  ultra: "Ultra",
};

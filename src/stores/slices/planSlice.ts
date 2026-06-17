import type { StateCreator } from "zustand";
import type { RootState } from "../interview";

export type PlanId = "lite" | "pro" | "ultra";

export interface FeatureFlags {
  custom_prompts: boolean;
  simultaneous_captures: boolean;
  simultaneous_analysis: boolean;
  keyboard_shortcuts: boolean;
  invisible_mode: boolean;
  ghost_mode: boolean;
}

export interface QuotaInfo {
  used: number;
  limit: number;
  remaining: number;
}

export interface PlanInfo {
  plan_id: PlanId;
  plan_name: string;
  features: FeatureFlags;
  quotas: Record<string, QuotaInfo>;
}

export interface PlanSlice {
  planInfo: PlanInfo | null;
  setPlanInfo: (info: PlanInfo) => void;
  updateQuota: (quotaKey: string, info: QuotaInfo) => void;
  hasFeature: (feature: keyof FeatureFlags) => boolean;
  getQuota: (quotaKey: string) => QuotaInfo | null;
}

export const DEFAULT_PLAN_INFO: PlanInfo = {
  plan_id: "lite",
  plan_name: "Lite",
  features: {
    custom_prompts: false,
    simultaneous_captures: false,
    simultaneous_analysis: false,
    keyboard_shortcuts: false,
    invisible_mode: false,
    ghost_mode: false,
  },
  quotas: {
    transcription_seconds: { used: 0, limit: 1200, remaining: 1200 },
    screen_captures: { used: 0, limit: 2, remaining: 2 },
    screen_analyses: { used: 0, limit: 2, remaining: 2 },
  },
};

export const createPlanSlice: StateCreator<RootState, [], [], PlanSlice> = (
  set,
  get
) => ({
  planInfo: null,

  setPlanInfo: (info) => set({ planInfo: info }),

  updateQuota: (quotaKey, info) =>
    set((state) => ({
      planInfo: state.planInfo
        ? {
            ...state.planInfo,
            quotas: { ...state.planInfo.quotas, [quotaKey]: info },
          }
        : null,
    })),

  hasFeature: (feature) => {
    const plan = get().planInfo ?? DEFAULT_PLAN_INFO;
    return plan.features[feature] ?? false;
  },

  getQuota: (quotaKey) => {
    const plan = get().planInfo ?? DEFAULT_PLAN_INFO;
    return plan.quotas[quotaKey] ?? null;
  },
});

import type { StateCreator } from "zustand";
import type { RootState } from "../interview";

export type PlanId = "free" | "lite" | "pro" | "ultra";

export interface FeatureFlags {
  custom_prompts: boolean;
  simultaneous_captures: boolean;
  simultaneous_analysis: boolean;
  keyboard_shortcuts: boolean;
  invisible_mode: boolean;
  ghost_mode: boolean;
  thinking_mode: boolean;
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

export interface PendingUpgrade {
  planId: PlanId;
  startedAt: number;
}

export interface PlanSlice {
  planInfo: PlanInfo | null;
  liveTranscriptionRemaining: number | null;
  countdownActive: boolean;
  pendingUpgrade: PendingUpgrade | null;
  setPlanInfo: (info: PlanInfo) => void;
  mergePlanInfo: (info: PlanInfo) => void;
  updateQuota: (quotaKey: string, info: QuotaInfo) => void;
  updateQuotas: (quotas: Record<string, QuotaInfo>) => void;
  syncQuotasFromConvex: (quotas: Record<string, QuotaInfo>) => void;
  setLiveTranscriptionRemaining: (value: number | null) => void;
  setCountdownActive: (active: boolean) => void;
  setPendingUpgrade: (planId: PlanId) => void;
  clearPendingUpgrade: () => void;
  hasFeature: (feature: keyof FeatureFlags) => boolean;
  getQuota: (quotaKey: string) => QuotaInfo | null;
}

export const DEFAULT_PLAN_INFO: PlanInfo = {
  plan_id: "free",
  plan_name: "Free",
  features: {
    custom_prompts: false,
    simultaneous_captures: false,
    simultaneous_analysis: false,
    keyboard_shortcuts: false,
    invisible_mode: false,
    ghost_mode: false,
    thinking_mode: false,
  },
  quotas: {
    transcription_seconds: { used: 0, limit: 180, remaining: 180 },
    screen_captures: { used: 0, limit: 1, remaining: 1 },
    screen_analyses: { used: 0, limit: 1, remaining: 1 },
  },
};

export const createPlanSlice: StateCreator<RootState, [], [], PlanSlice> = (
  set,
  get
) => ({
  planInfo: null,
  liveTranscriptionRemaining: null,
  countdownActive: false,
  pendingUpgrade: null,

  setPlanInfo: (info) => set({ planInfo: info }),

  mergePlanInfo: (info) =>
    set((state) => {
      if (!state.planInfo) {
        return { planInfo: info };
      }

      const nextQuotas = { ...state.planInfo.quotas };
      let changed = false;

      for (const [key, incoming] of Object.entries(info.quotas)) {
        if (!incoming) continue;
        const current = nextQuotas[key];
        if (!current) {
          nextQuotas[key] = { ...incoming };
          changed = true;
        } else if (current.limit !== incoming.limit) {
          nextQuotas[key] = { ...incoming };
          changed = true;
        } else if (incoming.remaining < current.remaining) {
          nextQuotas[key] = {
            ...current,
            remaining: incoming.remaining,
            used: Math.max(0, current.limit - incoming.remaining),
          };
          changed = true;
        }
      }

      const featuresChanged =
        JSON.stringify(state.planInfo.features) !== JSON.stringify(info.features) ||
        state.planInfo.plan_id !== info.plan_id ||
        state.planInfo.plan_name !== info.plan_name;

      if (!changed && !featuresChanged) return state;

      return {
        planInfo: {
          ...state.planInfo,
          plan_id: info.plan_id,
          plan_name: info.plan_name,
          features: info.features,
          quotas: changed ? nextQuotas : state.planInfo.quotas,
        },
      };
    }),

  updateQuota: (quotaKey, info) =>
    set((state) => ({
      planInfo: state.planInfo
        ? {
            ...state.planInfo,
            quotas: { ...state.planInfo.quotas, [quotaKey]: info },
          }
        : null,
    })),

  updateQuotas: (quotas) =>
    set((state) => {
      if (!state.planInfo) return state;
      const nextQuotas = { ...state.planInfo.quotas };
      let changed = false;
      for (const [key, incoming] of Object.entries(quotas)) {
        if (!incoming) continue;
        const current = nextQuotas[key];
        if (!current) {
          nextQuotas[key] = { ...incoming };
          changed = true;
        } else if (current.limit !== incoming.limit) {
          nextQuotas[key] = { ...incoming };
          changed = true;
        } else if (incoming.remaining < current.remaining) {
          nextQuotas[key] = {
            ...current,
            remaining: incoming.remaining,
            used: Math.max(0, current.limit - incoming.remaining),
          };
          changed = true;
        }
      }
      if (!changed) return state;
      return { planInfo: { ...state.planInfo, quotas: nextQuotas } };
    }),

  syncQuotasFromConvex: (quotas) =>
    set((state) => {
      if (!state.planInfo) return state;
      const nextQuotas = { ...state.planInfo.quotas };
      let changed = false;

      for (const [key, convexQuota] of Object.entries(quotas)) {
        const current = nextQuotas[key];
        if (!current || !convexQuota) continue;

        if (current.limit !== convexQuota.limit) {
          // Plan changed (e.g. upgrade); trust Convex's values.
          nextQuotas[key] = { ...convexQuota };
          changed = true;
        } else if (convexQuota.remaining < current.remaining) {
          // Convex has less remaining than in-memory (consumed elsewhere/flushed).
          nextQuotas[key] = {
            ...current,
            remaining: convexQuota.remaining,
            used: Math.max(0, current.limit - convexQuota.remaining),
          };
          changed = true;
        }
      }

      if (!changed) return state;
      return { planInfo: { ...state.planInfo, quotas: nextQuotas } };
    }),

  setLiveTranscriptionRemaining: (value) => set({ liveTranscriptionRemaining: value }),

  setCountdownActive: (active) => set({ countdownActive: active }),

  setPendingUpgrade: (planId) =>
    set({ pendingUpgrade: { planId, startedAt: Date.now() } }),

  clearPendingUpgrade: () => set({ pendingUpgrade: null }),

  hasFeature: (feature) => {
    const plan = get().planInfo ?? DEFAULT_PLAN_INFO;
    return plan.features[feature] ?? false;
  },

  getQuota: (quotaKey) => {
    const plan = get().planInfo ?? DEFAULT_PLAN_INFO;
    return plan.quotas[quotaKey] ?? null;
  },
});

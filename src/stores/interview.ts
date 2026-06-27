import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createSessionSlice, type SessionSlice } from "./slices/sessionSlice";
import { createSettingsSlice, type SettingsSlice } from "./slices/settingsSlice";
import { createScreenSlice, type ScreenSlice } from "./slices/screenSlice";
import { createPlanSlice, type PlanSlice } from "./slices/planSlice";
import { createUISlice, type UISlice } from "./slices/uiSlice";
import { createAuthSlice, type AuthSlice } from "./slices/authSlice";

export type { Status, QAEntry } from "./slices/sessionSlice";
export type { Language, Theme } from "./slices/settingsSlice";
export type { PlanId, FeatureFlags, QuotaInfo, PlanInfo, PendingUpgrade } from "./slices/planSlice";
export type { ToastType, ToastState } from "./slices/uiSlice";

export interface RootState extends SessionSlice, SettingsSlice, ScreenSlice, PlanSlice, UISlice, AuthSlice {
  reset: () => void;
}

export const useInterviewStore = create<RootState>()(
  persist(
    (...a) => ({
      ...createSessionSlice(...a),
      ...createSettingsSlice(...a),
      ...createScreenSlice(...a),
      ...createPlanSlice(...a),
      ...createUISlice(...a),
      ...createAuthSlice(...a),
      reset: () => {
        const set = a[0];
        set({
          status: "idle",
          language: "en",
          transcription: "",
          responseChunks: [],
          qaHistory: [],
          error: null,
          questionsAnswered: 0,
          planInfo: null,
          liveTranscriptionRemaining: null,
          countdownActive: false,
          sessionStartTime: null,
          toast: null,
        });
      },
    }),
    {
      name: "interview-settings",
      partialize: (state) => ({
        customPrompts: state.customPrompts,
        language: state.language,
        theme: state.theme,
        audioSource: state.audioSource,
        pendingUpgrade: state.pendingUpgrade,
        userKey: state.userKey,
      }),
      migrate: (persistedState: unknown) => {
        if (persistedState && typeof persistedState === "object") {
          const s = persistedState as { theme?: unknown; language?: unknown };
          if ("theme" in s) {
            if (s.theme !== "dark" && s.theme !== "glass") {
              s.theme = "dark";
            }
          }
          if ("language" in s) {
            if (s.language !== "en" && s.language !== "es") {
              s.language = "en";
            } else {
              s.language = "en";
            }
          }
        }
        return persistedState as never;
      },
    }
  )
);

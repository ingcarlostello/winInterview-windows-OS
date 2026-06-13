import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createSessionSlice, type SessionSlice } from "./slices/sessionSlice";
import { createSettingsSlice, type SettingsSlice } from "./slices/settingsSlice";
import { createScreenSlice, type ScreenSlice } from "./slices/screenSlice";

export type { Status } from "./slices/sessionSlice";
export type { Language, Theme } from "./slices/settingsSlice";

export interface RootState extends SessionSlice, SettingsSlice, ScreenSlice {
  reset: () => void;
}

export const useInterviewStore = create<RootState>()(
  persist(
    (...a) => ({
      ...createSessionSlice(...a),
      ...createSettingsSlice(...a),
      ...createScreenSlice(...a),
      reset: () => {
        const set = a[0];
        set({
          status: "idle",
          language: "es",
          transcription: "",
          responseChunks: [],
          error: null,
          questionsAnswered: 0,
        });
      },
    }),
    {
      name: "interview-settings",
      partialize: (state) => ({
        customPrompts: state.customPrompts,
        language: state.language,
        theme: state.theme,
      }),
      migrate: (persistedState: unknown) => {
        if (persistedState && typeof persistedState === "object" && "theme" in persistedState) {
          const theme = (persistedState as { theme: unknown }).theme;
          if (theme !== "dark" && theme !== "glass") {
            (persistedState as { theme: string }).theme = "dark";
          }
        }
        return persistedState as never;
      },
    }
  )
);

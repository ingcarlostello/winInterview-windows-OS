import type { StateCreator } from "zustand";
import type { RootState } from "../interview";

export type Language = "es" | "en";
export type Theme = "dark" | "glass";

interface CustomPrompts {
  es: string;
  en: string;
}

export interface SettingsSlice {
  language: Language;
  theme: Theme;
  customPrompts: CustomPrompts;
  showPromptEditor: boolean;
  ghostMode: boolean;
  contentProtected: boolean;
  setLanguage: (language: Language) => void;
  setTheme: (theme: Theme) => void;
  setCustomPrompt: (language: Language, prompt: string) => void;
  clearCustomPrompt: (language: Language) => void;
  getCustomPrompt: () => string;
  hasCustomPrompt: () => boolean;
  togglePromptEditor: () => void;
  setGhostMode: (on: boolean) => void;
  setContentProtected: (on: boolean) => void;
}

export const createSettingsSlice: StateCreator<RootState, [], [], SettingsSlice> = (set, get) => ({
  language: "es",
  theme: "dark",
  customPrompts: { es: "", en: "" },
  showPromptEditor: false,
  ghostMode: false,
  contentProtected: true,

  setLanguage: (language) => set({ language }),
  setTheme: (theme) => set({ theme }),
  setCustomPrompt: (language, prompt) =>
    set((state) => ({
      customPrompts: { ...state.customPrompts, [language]: prompt },
    })),
  clearCustomPrompt: (language) =>
    set((state) => ({
      customPrompts: { ...state.customPrompts, [language]: "" },
    })),
  getCustomPrompt: () => {
    const { language, customPrompts } = get();
    return customPrompts[language] || "";
  },
  hasCustomPrompt: () => {
    const { language, customPrompts } = get();
    return !!customPrompts[language]?.trim();
  },
  togglePromptEditor: () =>
    set((state) => ({ showPromptEditor: !state.showPromptEditor })),
  setGhostMode: (on) => set({ ghostMode: on }),
  setContentProtected: (on) => set({ contentProtected: on }),
});

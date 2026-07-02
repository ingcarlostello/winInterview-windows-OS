import type { StateCreator } from "zustand";
import type { RootState } from "../interview";

export type Language = "es" | "en";
export type Theme = "dark" | "glass";
export type AudioSource = "mic" | "system" | "both";

/**
 * Gate a persisted `audioSource` against the current plan's capabilities.
 *
 * `audioSource` is persisted in localStorage and is NOT tied to the plan, so a
 * stale `"system"`/`"both"` value (e.g. left over from an Ultra session on the
 * same machine, or a downgrade) would otherwise drive the Rust capture and make
 * the app record system/loopback audio instead of the microphone. Since audio
 * capture moved to the Rust client (2026-06-30), the backend can no longer
 * enforce this — the client must. Returns `"mic"` whenever the plan lacks the
 * feature the source requires; otherwise returns the source unchanged.
 *
 * Takes plain booleans (not `FeatureFlags`) to stay decoupled from the plan slice.
 */
export function gateAudioSource(
  source: AudioSource,
  canSystemAudio: boolean,
  canSimultaneousAudio: boolean,
): AudioSource {
  if (source === "system" && !canSystemAudio) return "mic";
  if (source === "both" && !canSimultaneousAudio) return "mic";
  return source;
}

interface CustomPrompts {
  es: string;
  en: string;
}

export interface SettingsSlice {
  language: Language;
  theme: Theme;
  audioSource: AudioSource;
  customPrompts: CustomPrompts;
  showPromptEditor: boolean;
  ghostMode: boolean;
  contentProtected: boolean;
  alwaysOnTop: boolean;
  setLanguage: (language: Language) => void;
  setTheme: (theme: Theme) => void;
  setAudioSource: (source: AudioSource) => void;
  setCustomPrompt: (language: Language, prompt: string) => void;
  clearCustomPrompt: (language: Language) => void;
  getCustomPrompt: () => string;
  hasCustomPrompt: () => boolean;
  togglePromptEditor: () => void;
  setGhostMode: (on: boolean) => void;
  setContentProtected: (on: boolean) => void;
  setAlwaysOnTop: (on: boolean) => void;
}

export const createSettingsSlice: StateCreator<RootState, [], [], SettingsSlice> = (set, get) => ({
  language: "en",
  theme: "dark",
  audioSource: "mic",
  customPrompts: { es: "", en: "" },
  showPromptEditor: false,
  ghostMode: false,
  contentProtected: false,
  alwaysOnTop: true,

  setLanguage: (language) => set({ language }),
  setTheme: (theme) => set({ theme }),
  setAudioSource: (audioSource) => set({ audioSource }),
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
  setAlwaysOnTop: (on) => set({ alwaysOnTop: on }),
});

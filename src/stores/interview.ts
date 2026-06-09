import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Language = "es" | "en";
export type Theme = "dark" | "liquid";

export type Status =
  | "idle"
  | "connected"
  | "listening"
  | "thinking"
  | "responding"
  | "paused"
  | "reconnecting"
  | "error";

interface CustomPrompts {
  es: string;
  en: string;
}

interface InterviewState {
  status: Status;
  language: Language;
  transcription: string;
  responseChunks: string[];
  error: string | null;
  questionsAnswered: number;
  customPrompts: CustomPrompts;
  showPromptEditor: boolean;
  ghostMode: boolean;
  contentProtected: boolean;
  theme: Theme;

  setStatus: (status: Status) => void;
  setLanguage: (language: Language) => void;
  setTranscription: (text: string) => void;
  addResponseChunk: (chunk: string) => void;
  clearResponse: () => void;
  setError: (error: string) => void;
  reset: () => void;
  clearAll: () => void;
  incrementQuestionsAnswered: () => void;
  setCustomPrompt: (language: Language, prompt: string) => void;
  clearCustomPrompt: (language: Language) => void;
  getCustomPrompt: () => string;
  hasCustomPrompt: () => boolean;
  togglePromptEditor: () => void;
  setGhostMode: (on: boolean) => void;
  setContentProtected: (on: boolean) => void;
  setTheme: (theme: Theme) => void;
}

export const useInterviewStore = create<InterviewState>()(
  persist(
    (set, get) => ({
      status: "idle",
      language: "es",
      transcription: "",
      responseChunks: [],
      error: null,
      questionsAnswered: 0,
      customPrompts: { es: "", en: "" },
      showPromptEditor: false,
      ghostMode: false,
      contentProtected: true,
      theme: "dark",

      setStatus: (status) => set({ status }),

      setLanguage: (language) => set({ language }),

      setTranscription: (text) => set({ transcription: text }),

      addResponseChunk: (chunk) =>
        set((state) => ({
          responseChunks: [...state.responseChunks, chunk],
        })),

      clearResponse: () => set({ responseChunks: [] }),
      clearAll: () => set({ responseChunks: [], transcription: "" }),

      setError: (error) => set({ error, status: "error" }),

      reset: () =>
        set({
          status: "idle",
          language: "es",
          transcription: "",
          responseChunks: [],
          error: null,
          questionsAnswered: 0,
        }),

      incrementQuestionsAnswered: () =>
        set((state) => ({ questionsAnswered: state.questionsAnswered + 1 })),

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
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "interview-settings",
      partialize: (state) => ({
        customPrompts: state.customPrompts,
        language: state.language,
        theme: state.theme,
      }),
    },
  ),
);

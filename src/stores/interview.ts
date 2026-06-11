import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Language = "es" | "en";
export type Theme = "dark" | "glass";

export type Status =
  | "idle"
  | "connected"
  | "listening"
  | "thinking"
  | "responding"
  | "paused"
  | "reconnecting"
  | "capturing"
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
  screenPanelOpen: boolean;
  screenImage: string | null;
  screenImages: string[];
  screenChunks: string[];
  isCapturingScreen: boolean;
  isAnalyzingScreen: boolean;
  screenPrompt: string;

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
  setScreenPanelOpen: (open: boolean) => void;
  setScreenImage: (image: string | null) => void;
  addScreenImage: (image: string) => void;
  clearScreenImages: () => void;
  addScreenChunk: (chunk: string) => void;
  clearScreenChunks: () => void;
  clearScreen: () => void;
  setIsCapturingScreen: (capturing: boolean) => void;
  setIsAnalyzingScreen: (analyzing: boolean) => void;
  setScreenPrompt: (prompt: string) => void;
  canCaptureScreen: () => boolean;
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
      screenPanelOpen: false,
      screenImage: null,
      screenImages: [],
      screenChunks: [],
      isCapturingScreen: false,
      isAnalyzingScreen: false,
      screenPrompt: "",

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
      setScreenPanelOpen: (open) => set({ screenPanelOpen: open }),
      setScreenImage: (image) => set({ screenImage: image }),
      addScreenImage: (image) =>
        set((state) => {
          if (state.screenImages.length >= 4) return state;
          return { screenImages: [...state.screenImages, image] };
        }),
      clearScreenImages: () => set({ screenImages: [] }),
      addScreenChunk: (chunk) =>
        set((state) => ({
          screenChunks: [...state.screenChunks, chunk],
        })),
      clearScreenChunks: () => set({ screenChunks: [] }),
      clearScreen: () =>
        set({
          screenChunks: [],
          screenImage: null,
          screenImages: [],
          isAnalyzingScreen: false,
        }),
      setIsCapturingScreen: (capturing) => set({ isCapturingScreen: capturing }),
      setIsAnalyzingScreen: (analyzing) => set({ isAnalyzingScreen: analyzing }),
      setScreenPrompt: (prompt) => set({ screenPrompt: prompt }),
      canCaptureScreen: () => {
        const state = get();
        return state.screenImages.length < 4;
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
    },
  ),
);

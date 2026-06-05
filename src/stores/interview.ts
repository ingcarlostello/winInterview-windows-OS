import { create } from "zustand";

export type Language = "es" | "en";

export type Status =
  | "idle"
  | "connected"
  | "listening"
  | "thinking"
  | "responding"
  | "paused"
  | "error";

interface InterviewState {
  status: Status;
  language: Language;
  transcription: string;
  responseChunks: string[];
  error: string | null;
  questionsAnswered: number;

  setStatus: (status: Status) => void;
  setLanguage: (language: Language) => void;
  setTranscription: (text: string) => void;
  addResponseChunk: (chunk: string) => void;
  clearResponse: () => void;
  setError: (error: string) => void;
  reset: () => void;
  clearAll: () => void;
  incrementQuestionsAnswered: () => void;
}

export const useInterviewStore = create<InterviewState>((set) => ({
  status: "idle",
  language: "es",
  transcription: "",
  responseChunks: [],
  error: null,
  questionsAnswered: 0,

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
}));

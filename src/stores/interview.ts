import { create } from "zustand";

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
  transcription: string;
  responseChunks: string[];
  error: string | null;
  questionsAnswered: number;

  setStatus: (status: Status) => void;
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
  transcription: "",
  responseChunks: [],
  error: null,
  questionsAnswered: 0,

  setStatus: (status) => set({ status }),

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
      transcription: "",
      responseChunks: [],
      error: null,
      questionsAnswered: 0,
    }),

  incrementQuestionsAnswered: () =>
    set((state) => ({ questionsAnswered: state.questionsAnswered + 1 })),
}));

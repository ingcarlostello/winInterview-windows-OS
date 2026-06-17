import type { StateCreator } from "zustand";
import type { RootState } from "../interview";

export type Status = "idle" | "connected" | "listening" | "thinking" | "responding" | "paused" | "reconnecting" | "capturing" | "error";

export interface SessionSlice {
  status: Status;
  transcription: string;
  responseChunks: string[];
  error: string | null;
  questionsAnswered: number;
  sessionStartTime: number | null;
  setStatus: (status: Status) => void;
  setTranscription: (text: string) => void;
  addResponseChunk: (chunk: string) => void;
  clearResponse: () => void;
  setError: (error: string) => void;
  clearAll: () => void;
  incrementQuestionsAnswered: () => void;
  setSessionStartTime: (time: number | null) => void;
}

export const createSessionSlice: StateCreator<RootState, [], [], SessionSlice> = (set) => ({
  status: "idle",
  transcription: "",
  responseChunks: [],
  error: null,
  questionsAnswered: 0,
  sessionStartTime: null,
  setStatus: (status) => set({ status }),
  setTranscription: (text) => set({ transcription: text }),
  addResponseChunk: (chunk) =>
    set((state) => ({
      responseChunks: [...state.responseChunks, chunk],
    })),
  clearResponse: () => set({ responseChunks: [] }),
  clearAll: () => set({ responseChunks: [], transcription: "" }),
  setError: (error) => set({ error, status: "error" }),
  incrementQuestionsAnswered: () =>
    set((state) => ({ questionsAnswered: state.questionsAnswered + 1 })),
  setSessionStartTime: (time) => set({ sessionStartTime: time }),
});

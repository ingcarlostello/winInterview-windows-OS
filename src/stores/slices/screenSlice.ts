import type { StateCreator } from "zustand";
import type { RootState } from "../interview";

export interface ScreenSlice {
  screenPanelOpen: boolean;
  screenImage: string | null;
  screenImages: string[];
  screenChunks: string[];
  isCapturingScreen: boolean;
  isAnalyzingScreen: boolean;
  screenPrompt: string;
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

export const createScreenSlice: StateCreator<RootState, [], [], ScreenSlice> = (set, get) => ({
  screenPanelOpen: false,
  screenImage: null,
  screenImages: [],
  screenChunks: [],
  isCapturingScreen: false,
  isAnalyzingScreen: false,
  screenPrompt: "",

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
});

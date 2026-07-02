import type { StateCreator } from "zustand";
import type { RootState } from "../interview";

export interface ScreenSlice {
  screenPanelOpen: boolean;
  screenImages: string[];
  screenChunks: string[];
  isCapturingScreen: boolean;
  isAnalyzingScreen: boolean;
  screenPrompt: string;
  setScreenPanelOpen: (open: boolean) => void;
  addScreenImage: (image: string) => void;
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
  screenImages: [],
  screenChunks: [],
  isCapturingScreen: false,
  isAnalyzingScreen: false,
  screenPrompt: "",

  setScreenPanelOpen: (open) => set({ screenPanelOpen: open }),
  addScreenImage: (image) =>
    set((state) => {
      if (state.screenImages.length >= 4) return state;
      return { screenImages: [...state.screenImages, image] };
    }),
  addScreenChunk: (chunk) =>
    set((state) => ({
      screenChunks: [...state.screenChunks, chunk],
    })),
  clearScreenChunks: () => set({ screenChunks: [] }),
  clearScreen: () =>
    set({
      screenChunks: [],
      screenImages: [],
      isAnalyzingScreen: false,
    }),
  setIsCapturingScreen: (capturing) => set({ isCapturingScreen: capturing }),
  setIsAnalyzingScreen: (analyzing) => set({ isAnalyzingScreen: analyzing }),
  setScreenPrompt: (prompt) => set({ screenPrompt: prompt }),
  canCaptureScreen: () => {
    const state = get();
    const plan = state.planInfo;
    const maxCaptures = plan?.features.simultaneous_captures ? 4 : 1;
    const quota = plan?.quotas.screen_captures;
    if (quota && quota.remaining <= 0) return false;
    return state.screenImages.length < maxCaptures;
  },
});

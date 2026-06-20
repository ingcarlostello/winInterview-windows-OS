import type { StateCreator } from "zustand";
import type { RootState } from "../interview";

export type ToastType = "success" | "info";

export interface ToastState {
  message: string;
  type: ToastType;
}

export interface UISlice {
  toast: ToastState | null;
  showToast: (message: string, type?: ToastType) => void;
  clearToast: () => void;
}

export const createUISlice: StateCreator<RootState, [], [], UISlice> = (
  set,
) => ({
  toast: null,

  showToast: (message, type = "info") => set({ toast: { message, type } }),

  clearToast: () => set({ toast: null }),
});

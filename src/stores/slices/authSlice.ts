import type { StateCreator } from "zustand";
import type { RootState } from "../interview";

export interface AuthSlice {
  /**
   * Desktop access key (`wik_*`), pasted from the web dashboard. When set, the
   * app runs in "key" auth mode (no Clerk session) and authenticates to the
   * Python backend with this key. Persisted so the user stays logged in.
   */
  userKey: string | null;
  setUserKey: (key: string) => void;
  clearUserKey: () => void;
}

export const createAuthSlice: StateCreator<RootState, [], [], AuthSlice> = (
  set
) => ({
  userKey: null,
  setUserKey: (key) => set({ userKey: key.trim() }),
  clearUserKey: () => set({ userKey: null }),
});

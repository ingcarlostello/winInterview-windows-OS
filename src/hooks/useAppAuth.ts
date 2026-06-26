import { useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useInterviewStore } from "../stores/interview";

export type AuthMode = "clerk" | "key";

/**
 * Unifies the two ways a desktop user can authenticate:
 *  - "clerk": signed in via Clerk inside the app (browser-style OAuth)
 *  - "key":   a pasted access key (`wik_*`) persisted in the store; no Clerk session
 *
 * In key mode the app talks only to the Python WS backend, which resolves the
 * key to the user server-side. Direct Convex calls (which need a Clerk JWT) must
 * be skipped by callers when `mode === "key"`.
 */
export function useAppAuth() {
  const userKey = useInterviewStore((s) => s.userKey);
  const { isLoaded, isSignedIn, getToken } = useAuth();

  const mode: AuthMode = userKey ? "key" : "clerk";
  // Whether the auth layer has settled enough to render the app shell.
  const isReady = mode === "key" ? true : isLoaded;
  // Whether the user can open a backend session.
  const isAuthed = mode === "key" ? true : Boolean(isSignedIn);

  /** Credential segment for the backend WS URL: `key=...` or `token=...`. */
  const getAuthParam = useCallback(async (): Promise<string | null> => {
    if (userKey) {
      return `key=${encodeURIComponent(userKey)}`;
    }
    const token = await getToken();
    return token ? `token=${token}` : null;
  }, [userKey, getToken]);

  return { mode, isReady, isAuthed, getAuthParam };
}

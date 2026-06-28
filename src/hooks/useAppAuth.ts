import { useCallback } from "react";
import { useInterviewStore } from "../stores/interview";

/**
 * The desktop app authenticates only with a pasted access key (`wik_*`),
 * persisted in the store. Clerk login lives in the separate web app, where the
 * key is generated. The Python WS backend resolves the key to the user
 * server-side, so the app never needs a Clerk JWT.
 */
export function useAppAuth() {
  const userKey = useInterviewStore((s) => s.userKey);

  const isAuthed = Boolean(userKey);

  /** Credential segment for the backend WS URL: `key=...` (or null if no key). */
  const getAuthParam = useCallback(async (): Promise<string | null> => {
    return userKey ? `key=${encodeURIComponent(userKey)}` : null;
  }, [userKey]);

  return { isAuthed, getAuthParam };
}

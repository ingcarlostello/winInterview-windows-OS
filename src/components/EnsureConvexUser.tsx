import { useEffect, useState } from "react";
import { useConvex, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useConvexAuth } from "convex/react";
import { useAuth } from "@clerk/clerk-react";

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 1500;

export default function EnsureConvexUser() {
  const storeUser = useMutation(api.users.storeUser);
  const convex = useConvex();
  const { isLoading: convexAuthLoading, isAuthenticated: convexAuthenticated } = useConvexAuth();
  const { isLoaded: clerkLoaded, isSignedIn, userId } = useAuth();
  const [status, setStatus] = useState<"idle" | "storing" | "ok" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clerkLoaded) {
      console.debug("[EnsureConvexUser] Waiting for Clerk auth to load...");
      return;
    }
    if (!isSignedIn) {
      console.debug("[EnsureConvexUser] User not signed in, skipping storeUser");
      return;
    }
    if (convexAuthLoading || !convexAuthenticated) {
      console.debug(
        `[EnsureConvexUser] Waiting for Convex auth (loading=${convexAuthLoading}, authed=${convexAuthenticated})...`
      );
      return;
    }

    let cancelled = false;
    let attempt = 0;

    const attemptStore = async () => {
      if (cancelled) return;
      attempt += 1;
      setStatus("storing");
      console.debug(
        `[EnsureConvexUser] Attempt ${attempt}/${MAX_RETRIES} to store user ${userId} in Convex...`
      );

      try {
        const id = await storeUser();
        if (cancelled) return;
        console.debug(
          `[EnsureConvexUser] Successfully stored user ${userId} -> Convex id ${id}`
        );
        setStatus("ok");
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[EnsureConvexUser] Attempt ${attempt} failed:`, message);
        if (cancelled) return;

        if (attempt < MAX_RETRIES) {
          console.debug(`[EnsureConvexUser] Retrying in ${RETRY_DELAY_MS}ms...`);
          setTimeout(attemptStore, RETRY_DELAY_MS);
        } else {
          console.error(
            `[EnsureConvexUser] All ${MAX_RETRIES} attempts failed. User not in Convex.`
          );
          setStatus("error");
          setError(message);
        }
      }
    };

    attemptStore();

    return () => {
      cancelled = true;
    };
  }, [
    storeUser,
    convex,
    clerkLoaded,
    isSignedIn,
    userId,
    convexAuthLoading,
    convexAuthenticated,
  ]);

  if (status === "error" && import.meta.env.DEV) {
    return (
      <div
        data-tauri-drag-region
        style={{
          position: "fixed",
          top: 4,
          right: 4,
          padding: "4px 8px",
          fontSize: 10,
          background: "rgba(220, 38, 38, 0.9)",
          color: "white",
          borderRadius: 4,
          zIndex: 9999,
          fontFamily: "monospace",
          pointerEvents: "none",
        }}
      >
        Convex sync failed: {error}
      </div>
    );
  }

  return null;
}
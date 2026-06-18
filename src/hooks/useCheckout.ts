import { useState, useCallback } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { invoke } from "@tauri-apps/api/core";

type CheckoutState = "idle" | "loading" | "success" | "error";

export function useCheckout() {
  const createCheckout = useAction(api.paddle.createCheckout);
  const [state, setState] = useState<CheckoutState>("idle");
  const [error, setError] = useState<string | null>(null);

  const startCheckout = useCallback(
    async (planId: "lite" | "pro" | "ultra") => {
      setState("loading");
      setError(null);

      try {
        const result = await createCheckout({ planId });
        if (!result?.checkoutUrl) {
          throw new Error("No checkout URL returned");
        }

        await invoke("open_url", { url: result.checkoutUrl });
        setState("success");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[useCheckout] Error:", message);
        setError(message);
        setState("error");
      }
    },
    [createCheckout],
  );

  const openExternalUrl = useCallback(async (url: string) => {
    try {
      await invoke("open_url", { url });
    } catch (err) {
      console.error("[useCheckout] Failed to open URL:", err);
    }
  }, []);

  const reset = useCallback(() => {
    setState("idle");
    setError(null);
  }, []);

  return { state, error, startCheckout, openExternalUrl, reset };
}

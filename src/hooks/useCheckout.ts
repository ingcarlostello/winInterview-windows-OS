import { useState, useCallback } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { invoke } from "@tauri-apps/api/core";
import { initializePaddle, type Paddle } from "@paddle/paddle-js";
import { useInterviewStore } from "../stores/interview";

const PADDLE_CLIENT_TOKEN =
  import.meta.env.VITE_PADDLE_CLIENT_TOKEN ||
  "test_ae06f9b82ccc34fea4638e027a2";

type CheckoutState = "idle" | "loading" | "success" | "error";

let paddleInstance: Paddle | undefined;

async function getPaddle(): Promise<Paddle | undefined> {
  if (paddleInstance) return paddleInstance;
  paddleInstance = await initializePaddle({
    token: PADDLE_CLIENT_TOKEN,
    environment: "sandbox",
  });
  return paddleInstance;
}

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
        if (!result?.transactionId) {
          throw new Error("No transaction ID returned");
        }

        const Paddle = await getPaddle();
        if (!Paddle) {
          throw new Error("Paddle.js not loaded");
        }

        Paddle.Checkout.open({
          transactionId: result.transactionId,
          settings: {
            displayMode: "overlay",
            theme: "dark",
            variant: "one-page",
            frameStyle:"width: 100%; min-width: 312px; background-color: transparent; border: none;",
          },
        });

        useInterviewStore.getState().setPendingUpgrade(planId);
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

import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useInterviewStore } from "../stores/interview";
import { useCaptureQuota } from "./useCaptureQuota";

export function useScreenCapture() {
  const { decrementCapture } = useCaptureQuota();

  const captureScreen = useCallback(async (): Promise<string | null> => {
    const store = useInterviewStore.getState();
    if (!store.canCaptureScreen()) return null;

    store.setIsCapturingScreen(true);

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });

    try {
      const img = await invoke<string>("capture_screen");

      const result = await decrementCapture();
      if (result) {
        const quota = useInterviewStore.getState().planInfo?.quotas.screen_captures;
        const limit = quota?.limit ?? 0;
        useInterviewStore.getState().updateQuota("screen_captures", {
          used: Math.max(0, limit - result.capturesRemaining),
          limit,
          remaining: result.capturesRemaining,
        });
      }

      useInterviewStore.getState().addScreenImage(img);
      return img;
    } catch (error) {
      console.error("[useScreenCapture] Error capturing screen:", error);
      return null;
    } finally {
      useInterviewStore.getState().setIsCapturingScreen(false);
    }
  }, [decrementCapture]);

  return { captureScreen };
}

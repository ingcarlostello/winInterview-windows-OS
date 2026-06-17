import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

export interface DecrementCaptureResult {
  capturesRemaining: number;
}

export function useCaptureQuota() {
  const decrementMyQuota = useMutation(api.quotas.decrementMyQuota);

  return {
    decrementCapture: async (): Promise<DecrementCaptureResult | null> => {
      try {
        return await decrementMyQuota({ quotaType: "capture", amount: 1 });
      } catch (err) {
        console.error("[useCaptureQuota] Failed to decrement capture quota:", err);
        return null;
      }
    },
  };
}

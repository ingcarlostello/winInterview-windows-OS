import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useInterviewStore } from "../stores/interview";

export interface DecrementCaptureResult {
  capturesRemaining: number;
}

export function useCaptureQuota() {
  const decrementMyQuotaByKey = useMutation(api.quotas.decrementMyQuotaByKey);
  const userKey = useInterviewStore((s) => s.userKey);

  return {
    decrementCapture: async (): Promise<DecrementCaptureResult | null> => {
      if (!userKey) return null;
      try {
        return await decrementMyQuotaByKey({ userKey, amount: 1 });
      } catch (err) {
        console.error("[useCaptureQuota] Failed to decrement capture quota:", err);
        return null;
      }
    },
  };
}

import { useInterviewStore } from "../stores/interview";
import type { FeatureFlags } from "../stores/slices/planSlice";

export function useFeatureGate(feature: keyof FeatureFlags) {
  const hasFeature = useInterviewStore((s) => s.hasFeature);
  const planName = useInterviewStore((s) => s.planInfo?.plan_name ?? "Free");

  return {
    allowed: hasFeature(feature),
    planName,
  };
}

export function useQuotaInfo(quotaKey: string) {
  const getQuota = useInterviewStore((s) => s.getQuota);
  const planName = useInterviewStore((s) => s.planInfo?.plan_name ?? "Free");

  const quota = getQuota(quotaKey);
  return {
    used: quota?.used ?? 0,
    limit: quota?.limit ?? 0,
    remaining: quota?.remaining ?? 0,
    exceeded: quota ? quota.remaining <= 0 : false,
    planName,
  };
}

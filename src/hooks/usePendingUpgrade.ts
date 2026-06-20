import { useEffect, useRef } from "react";
import { useInterviewStore } from "../stores/interview";
import { useTranslation } from "./useTranslation";

const FALLBACK_TIMEOUT_MS = 30_000;
const TTL_MS = 15 * 60 * 1000;

function capitalizePlan(planId: string): string {
  return planId.charAt(0).toUpperCase() + planId.slice(1);
}

export function usePendingUpgrade() {
  const pendingUpgrade = useInterviewStore((s) => s.pendingUpgrade);
  const planInfo = useInterviewStore((s) => s.planInfo);
  const clearPendingUpgrade = useInterviewStore((s) => s.clearPendingUpgrade);
  const showToast = useInterviewStore((s) => s.showToast);
  const { t } = useTranslation();

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!pendingUpgrade) return;

    const age = Date.now() - pendingUpgrade.startedAt;
    if (age > TTL_MS) {
      clearPendingUpgrade();
    }
  }, [pendingUpgrade, clearPendingUpgrade]);

  useEffect(() => {
    if (!pendingUpgrade || !planInfo) return;

    if (planInfo.plan_id === pendingUpgrade.planId) {
      showToast(
        t("upgradeSuccess", { plan: capitalizePlan(pendingUpgrade.planId) }),
        "success",
      );
      clearPendingUpgrade();
    }
  }, [pendingUpgrade, planInfo, showToast, clearPendingUpgrade, t]);

  useEffect(() => {
    if (!pendingUpgrade) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const startFallbackTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        if (
          mountedRef.current &&
          useInterviewStore.getState().pendingUpgrade
        ) {
          showToast(t("upgradeFallback"), "info");
          clearPendingUpgrade();
        }
      }, FALLBACK_TIMEOUT_MS);
    };

    startFallbackTimer();

    const handleReturn = () => {
      if (document.visibilityState === "hidden") return;
      const current = useInterviewStore.getState().pendingUpgrade;
      if (current) {
        const currentAge = Date.now() - current.startedAt;
        if (currentAge <= TTL_MS) {
          startFallbackTimer();
        }
      }
    };

    window.addEventListener("focus", handleReturn);
    document.addEventListener("visibilitychange", handleReturn);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      window.removeEventListener("focus", handleReturn);
      document.removeEventListener("visibilitychange", handleReturn);
    };
  }, [pendingUpgrade, showToast, clearPendingUpgrade, t]);
}

import { useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useInterviewStore } from "../stores/interview";
import type { PlanInfo } from "../stores/slices/planSlice";

export function usePlanSync() {
  const convexPlanInfo = useQuery(api.users.getCurrentUserPlanInfo);
  const setPlanInfo = useInterviewStore((s) => s.setPlanInfo);
  const syncQuotasFromConvex = useInterviewStore((s) => s.syncQuotasFromConvex);
  const currentPlanInfo = useInterviewStore((s) => s.planInfo);

  useEffect(() => {
    if (!convexPlanInfo) return;

    if (!currentPlanInfo) {
      setPlanInfo(convexPlanInfo as unknown as PlanInfo);
      return;
    }

    // Always keep quotas in sync with Convex, but only adopt more restrictive values
    // so we don't overwrite in-memory consumption that hasn't been flushed yet.
    syncQuotasFromConvex(
      (convexPlanInfo as unknown as PlanInfo).quotas
    );
  }, [convexPlanInfo, currentPlanInfo, setPlanInfo, syncQuotasFromConvex]);
}

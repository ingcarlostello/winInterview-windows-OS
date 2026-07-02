import { useEffect } from "react";
import { useQuery } from "convex/react";
import { invoke } from "@tauri-apps/api/core";
import { api } from "../../convex/_generated/api";
import { useInterviewStore } from "../stores/interview";
import type { PlanInfo } from "../stores/slices/planSlice";
import { gateAudioSource } from "../stores/slices/settingsSlice";

export function usePlanSync() {
  const userKey = useInterviewStore((s) => s.userKey);
  // Key-only auth: resolve the plan from the pasted access key via the public
  // query. Seeds planInfo on app open and stays reactive if the plan changes on
  // the web (e.g. after an upgrade).
  const convexPlanInfo = useQuery(
    api.users.getPlanInfoByUserKey,
    userKey ? { userKey } : "skip"
  );
  const mergePlanInfo = useInterviewStore((s) => s.mergePlanInfo);

  useEffect(() => {
    if (!convexPlanInfo) return;

    const info = convexPlanInfo as unknown as PlanInfo;

    const prevPlanInfo = useInterviewStore.getState().planInfo;
    const prevInvisibleMode = prevPlanInfo?.features.invisible_mode ?? null;

    mergePlanInfo(info);

    if (prevInvisibleMode !== info.features.invisible_mode) {
      if (info.features.invisible_mode) {
        invoke("set_content_protected", { enabled: true }).catch(() => {});
        useInterviewStore.getState().setContentProtected(true);
      } else {
        invoke("set_content_protected", { enabled: false }).catch(() => {});
        useInterviewStore.getState().setContentProtected(false);
      }
    }

    // Sanitize a stale persisted audioSource against the authoritative plan seed
    // (same pattern as invisible_mode above). This runs on app open even if the
    // user never connects, so localStorage reflects what the plan actually allows.
    const currentSource = useInterviewStore.getState().audioSource;
    const gatedSource = gateAudioSource(
      currentSource,
      info.features.system_audio_capture,
      info.features.simultaneous_audio,
    );
    if (gatedSource !== currentSource) {
      useInterviewStore.getState().setAudioSource(gatedSource);
    }
  }, [convexPlanInfo, mergePlanInfo]);
}

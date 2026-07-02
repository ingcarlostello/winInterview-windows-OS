import { RefreshCw, X } from "lucide-react";
import { useTranslation } from "../hooks/useTranslation";
import type { UpdaterState } from "../hooks/useUpdater";

/**
 * Non-blocking pill shown when an update has been detected. The download runs
 * silently in the background (see useUpdater); this only surfaces once an update
 * is available and lets the user apply it on their own terms — never auto-
 * relaunching mid-interview. Dismissing hides it until the next launch.
 */
export default function UpdateBanner({
  available,
  version,
  ready,
  applying,
  apply,
  dismiss,
}: UpdaterState) {
  const { t } = useTranslation();
  if (!available) return null;

  const label = ready
    ? t("updateReady", { version: version ?? "" })
    : t("updateDownloading", { version: version ?? "" });

  return (
    <div className="fixed left-1/2 top-2 z-[100] flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/10 bg-[#0f1115]/95 px-4 py-2 text-xs text-white shadow-2xl backdrop-blur">
      <RefreshCw
        size={14}
        className={`text-[#a3e635] ${ready ? "" : "animate-spin"}`}
      />
      <span className="whitespace-nowrap">{label}</span>
      <button
        type="button"
        onClick={apply}
        disabled={!ready || applying}
        className="rounded-full bg-[#a3e635] px-3 py-1 font-semibold text-black transition hover:bg-[#b6f34d] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t("updateRestartNow")}
      </button>
      <button
        type="button"
        onClick={dismiss}
        className="rounded-full p-1 text-white/50 transition hover:text-white"
        aria-label={t("updateLater")}
        title={t("updateLater")}
      >
        <X size={14} />
      </button>
    </div>
  );
}

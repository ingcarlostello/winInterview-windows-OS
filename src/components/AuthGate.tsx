import { useEffect, useState } from "react";
import { Loader2, AlertCircle, RotateCcw } from "lucide-react";
import { useAppAuth } from "../hooks/useAppAuth";
import { useTranslation } from "../hooks/useTranslation";

const AUTH_TIMEOUT_MS = 10_000;

type AuthState = "loading" | "error";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { isReady } = useAppAuth();
  const { t } = useTranslation();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (isReady) return;
    const id = setTimeout(() => setTimedOut(true), AUTH_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [isReady]);

  if (!isReady) {
    const state: AuthState = timedOut ? "error" : "loading";

    return (
      <div
        data-tauri-drag-region
        className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-[#08090c] text-white"
      >
        {state === "loading" ? (
          <>
            <Loader2 size={32} className="animate-spin text-[#a3e635]" />
            <p className="text-sm text-white/60">{t("authLoading")}</p>
          </>
        ) : (
          <>
            <AlertCircle size={32} className="text-red-400" />
            <div className="text-center">
              <p className="text-sm font-semibold text-white">{t("authError")}</p>
              <p className="mt-1 max-w-xs text-xs text-white/50">{t("authErrorDesc")}</p>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
            >
              <RotateCcw size={14} />
              {t("btnRetry")}
            </button>
          </>
        )}
      </div>
    );
  }

  return <>{children}</>;
}

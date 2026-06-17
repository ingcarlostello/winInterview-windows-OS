import { Mic, Pause, Play, Eye, EyeOff, Square, Lock } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useInterviewStore } from "../stores/interview";
import { useTranslation } from "../hooks/useTranslation";
import { useFeatureGate, useQuotaInfo } from "../hooks/useFeatureGate";

interface ControlsProps {
  onPause: () => void;
  onResume: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

export default function Controls({
  onPause,
  onResume,
  onConnect,
  onDisconnect,
}: ControlsProps) {
  const status = useInterviewStore((s) => s.status);
  const contentProtected = useInterviewStore((s) => s.contentProtected);
  const setContentProtected = useInterviewStore((s) => s.setContentProtected);
  const theme = useInterviewStore((s) => s.theme);
  const { t } = useTranslation();
  const { allowed: canUseInvisibleMode } = useFeatureGate("invisible_mode");
  const { exceeded: transcriptionExceeded } = useQuotaInfo("transcription_seconds");
  const liveTranscriptionRemaining = useInterviewStore((s) => s.liveTranscriptionRemaining);
  const countdownActive = useInterviewStore((s) => s.countdownActive);
  const isPaused = status === "paused";

  const effectiveExceeded = countdownActive && liveTranscriptionRemaining !== null
    ? liveTranscriptionRemaining <= 0
    : transcriptionExceeded;

  const handleToggleProtection = async () => {
    const newState = await invoke<boolean>("toggle_content_protected");
    setContentProtected(newState);
  };

  return (
    <div className="flex items-center justify-between px-3 pb-2">
      <div className="flex items-center gap-2 mt-1 mb-1">
        {status === "idle" || status === "error" ? (
          effectiveExceeded ? (
            <button
              type="button"
              disabled
              title={t("quotaExhaustedTooltip")}
              className="flex items-center gap-1.5 mt-3 mb-1 px-3 py-1.5 text-xs font-bold rounded-lg cursor-not-allowed border border-red-500/30 bg-red-500/15 text-red-400"
            >
              <Lock size={13} />
              {t("quotaExhausted")}
            </button>
          ) : (
            <button
              type="button"
              onClick={onConnect}
              className={`flex items-center gap-1.5 mt-3 mb-1 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                theme === "glass"
                  ? "glass-button-active"
                  : "bg-accent-soft border border-accent-border text-accent hover:bg-accent/50"
              }`}
            >
              <Mic size={13} />
              {t("btnListen")}
            </button>
          )
        ) : status === "connected" ? (
          <button
            type="button"
            disabled
            className="flex items-center gap-1.5 px-3 py-1.5 mt-3 mb-1 text-xs font-medium rounded-lg bg-accent-press/50 text-white/70 cursor-not-allowed"
          >
            <svg
              className="w-3.5 h-3.5 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            {t("btnConnecting")}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => (isPaused ? onResume() : onPause())}
              className={`flex items-center gap-1.5 px-3 py-1.5 mt-3 mb-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                theme === "glass"
                  ? "glass-button-active"
                  : isPaused
                    ? "border border-accent-border bg-accent-press/50 text-accent hover:bg-accent/50"
                    : "border border-amber/30 bg-amber/20 text-amber hover:bg-amber/30"
              }`}
            >
              {isPaused ? (
                <>
                  <Play size={13} />
                  {t("btnResume")}
                </>
              ) : (
                <>
                  <Pause size={13} />
                  {t("btnPause")}
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onDisconnect}
              className={`flex items-center gap-1.5 px-3 py-1.5 mt-3 mb-1 text-xs font-bold rounded-xl transition-colors cursor-pointer ${
                theme === "glass"
                  ? "glass-button-danger"
                  : "border border-red/30 bg-red-500/20 text-red-400 hover:bg-red-500/30"
              }`}
            >
              <Square size={13} />
              {t("btnEnd")}
            </button>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={canUseInvisibleMode ? handleToggleProtection : undefined}
        className={`flex items-center justify-center w-6 h-6 rounded-full transition-colors ${
          canUseInvisibleMode
            ? `cursor-pointer ${
                theme === "glass"
                  ? "glass-button-active"
                  : contentProtected
                    ? "bg-accent-soft text-accent hover:bg-accent/30"
                    : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
              }`
            : "opacity-40 cursor-not-allowed"
        }`}
        title={canUseInvisibleMode ? (contentProtected ? t("contentProtected") : t("contentUnprotected")) : "Ultra"}
      >
        {canUseInvisibleMode ? (
          contentProtected ? <EyeOff size={20} /> : <Eye size={20} />
        ) : (
          <Lock size={14} />
        )}
      </button>
    </div>
  );
}

import { Mic, Pause, Play, Square, Shield, ShieldOff } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useInterviewStore } from "../stores/interview";
import { useTranslation } from "../hooks/useTranslation";

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
  const { t } = useTranslation();
  const isPaused = status === "paused";
  const isActive =
    status === "listening" || status === "thinking" || status === "responding";

  const handleToggleProtection = async () => {
    const newState = await invoke<boolean>("toggle_content_protected");
    setContentProtected(newState);
  };

  return (
    <div className="flex items-center justify-between px-3 pb-2">
      <div className="flex items-center gap-2 mt-1 mb-1">
        {status === "idle" || status === "error" ? (
          <button
            type="button"
            onClick={onConnect}
            className="flex items-center gap-1.5 mt-3 mb-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-green-500/20 border border-green/30 text-green-400 hover:bg-green-500/50 transition-colors cursor-pointer"
          >
            <Mic size={13} />
            {t("btnListen")}
          </button>
        ) : status === "connected" ? (
          <button
            type="button"
            disabled
            className="flex items-center gap-1.5 px-3 py-1.5 mt-3 mb-1 text-xs font-medium rounded-lg bg-green-600/50 text-white/70 cursor-not-allowed"
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
                isPaused
                  ? "border border-green/30 bg-green-600/50 text-green-400 hover:bg-green-500/50"
                  : "border border-yellow/30 bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/50"
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
              className="flex items-center gap-1.5 px-3 py-1.5 mt-3 mb-1 text-xs font-bold rounded-lg border border-red/30 text-red-400 bg-red-500/20 hover:bg-red-500/50 transition-colors cursor-pointer"
            >
              <Square size={13} />
              {t("btnEnd")}
            </button>
          </>
        )}
      </div>
      {isActive && (
        <button
          type="button"
          className="flex items-center justify-center w-6 h-6 rounded-full bg-white/10 text-white/50 hover:bg-white/20 hover:text-white/80 transition-colors cursor-pointer text-xs"
          title="Minimizar"
        >
          −
        </button>
      )}
      <button
        type="button"
        onClick={handleToggleProtection}
        className={`flex items-center justify-center w-6 h-6 rounded-full transition-colors cursor-pointer ${
          contentProtected
            ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
            : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
        }`}
        title={contentProtected ? t("contentProtected") : t("contentUnprotected")}
      >
        {contentProtected ? <Shield size={12} /> : <ShieldOff size={12} />}
      </button>
    </div>
  );
}

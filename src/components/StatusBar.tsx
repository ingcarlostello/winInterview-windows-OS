import {
  Bot,
  Crown,
  Eye,
  Layers,
  LogOut,
  Monitor,
  Minus,
  Pin,
  PinOff,
  X,
  Clock,
} from "lucide-react";
import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useInterviewStore } from "../stores/interview";
import type { Status } from "../stores/interview";
import LanguageSelector from "./LanguageSelector";
import AudioSourceSelector from "./AudioSourceSelector";
import SessionTimer from "./SessionTimer";
import PricingModal from "./PricingModal";
import { useTranslation } from "../hooks/useTranslation";
import { useFeatureGate, useQuotaInfo } from "../hooks/useFeatureGate";

type StatusStyle = {
  labelKey: string;
  dotColor: string;
  pulse: boolean;
  showMic: boolean;
  pillStyle: string;
};

const statusConfig: Record<Status, StatusStyle> = {
  idle: {
    labelKey: "statusDisconnected",
    dotColor: "bg-gray-500",
    pulse: false,
    showMic: false,
    pillStyle: "border border-white/10 bg-white/5 text-white/60",
  },
  connected: {
    labelKey: "statusReady",
    dotColor: "bg-gray-400",
    pulse: false,
    showMic: false,
    pillStyle: "border border-white/10 bg-white/5 text-white/60",
  },
  listening: {
    labelKey: "statusListening",
    dotColor: "bg-success",
    pulse: true,
    showMic: true,
    pillStyle: "border border-success/40 bg-success-soft text-success",
  },
  thinking: {
    labelKey: "statusThinking",
    dotColor: "bg-success",
    pulse: true,
    showMic: true,
    pillStyle: "border border-success/40 bg-success-soft text-success",
  },
  responding: {
    labelKey: "statusResponding",
    dotColor: "bg-success",
    pulse: false,
    showMic: true,
    pillStyle: "border border-success/40 bg-success-soft text-success",
  },
  paused: {
    labelKey: "statusPaused",
    dotColor: "bg-amber",
    pulse: false,
    showMic: false,
    pillStyle: "border border-amber/30 bg-amber/20 text-amber",
  },
  reconnecting: {
    labelKey: "statusReconnecting",
    dotColor: "bg-amber",
    pulse: true,
    showMic: false,
    pillStyle: "border border-amber/30 bg-amber/20 text-amber",
  },
  capturing: {
    labelKey: "statusCapturing",
    dotColor: "bg-success",
    pulse: true,
    showMic: false,
    pillStyle: "border border-success/40 bg-success-soft text-success",
  },
  error: {
    labelKey: "statusDisconnected",
    dotColor: "bg-red-500",
    pulse: false,
    showMic: false,
    pillStyle: "border border-red-500/30 bg-red-500/10 text-red-400",
  },
};

interface StatusBarProps {
  onChangeLanguage?: (language: string) => void;
  onToggleScreenPanel?: () => void;
  onLogout?: () => void;
}

export default function StatusBar({
  onChangeLanguage,
  onToggleScreenPanel,
  onLogout,
}: StatusBarProps) {
  const status = useInterviewStore((s) => s.status);
  const ghostMode = useInterviewStore((s) => s.ghostMode);
  const contentProtected = useInterviewStore((s) => s.contentProtected);
  const alwaysOnTop = useInterviewStore((s) => s.alwaysOnTop);
  const theme = useInterviewStore((s) => s.theme);
  const screenPanelOpen = useInterviewStore((s) => s.screenPanelOpen);
  const planInfo = useInterviewStore((s) => s.planInfo);
  const config = statusConfig[status];
  const { t } = useTranslation();
  const [pricingOpen, setPricingOpen] = useState(false);
  const { allowed: canUseGhostMode } = useFeatureGate("ghost_mode");
  const { allowed: canUseInvisibleMode } = useFeatureGate("invisible_mode");
  const { remaining: transcriptionRemaining, exceeded: transcriptionExceeded } =
    useQuotaInfo("transcription_seconds");
  const liveTranscriptionRemaining = useInterviewStore(
    (s) => s.liveTranscriptionRemaining,
  );
  const countdownActive = useInterviewStore((s) => s.countdownActive);

  const planName = planInfo?.plan_name ?? "Free";
  const planId = planInfo?.plan_id ?? "free";
  const planColorClass =
    planId === "ultra"
      ? "text-purple-400"
      : planId === "pro"
        ? "text-amber"
        : "text-white/50";

  const effectiveRemaining =
    countdownActive && liveTranscriptionRemaining !== null
      ? liveTranscriptionRemaining
      : transcriptionRemaining;
  const minutesLeft = Math.max(0, Math.floor(effectiveRemaining / 60));
  const isLowQuota = !transcriptionExceeded && minutesLeft <= 2;
  const quotaBadgeClass = transcriptionExceeded
    ? "border-red-500/40 bg-red-500/15 text-red-400"
    : isLowQuota
      ? "border-amber/40 bg-amber/15 text-amber"
      : "border-success/40 bg-success-soft text-success";

  const handleClose = () => getCurrentWindow().close();
  const handleMinimize = () => getCurrentWindow().minimize();

  return (
    <>
      {/* Row 1: Window controls + drag region */}
      <div
        data-tauri-drag-region
        className="flex items-center justify-between pl-3 pr-3 h-[50px] shrink-0 mb-5 border-b border-white/10 bg-white/5"
      >
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleClose}
            className="flex items-center justify-center w-4 h-4 rounded-full hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors cursor-pointer"
            title="Close"
          >
            <X size={11} strokeWidth={2.5} />
          </button>
          <button
            onClick={handleMinimize}
            className="flex items-center justify-center w-4 h-4 rounded-full hover:bg-amber-500/20 text-white/40 hover:text-amber-400 transition-colors cursor-pointer"
            title="Minimize"
          >
            <Minus size={11} strokeWidth={2.5} />
          </button>
        </div>

        <div className="flex items-center">
          <span
            data-tauri-drag-region
            className="text-white text-[11px] font-medium select-none"
          >
            InterviewCopilot
          </span>
          <button
            onClick={() =>
              useInterviewStore
                .getState()
                .setTheme(theme === "dark" ? "glass" : "dark")
            }
            className={`ml-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all group ${
              theme === "glass"
                ? "glass-button-active"
                : "border border-white/10 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white cursor-pointer"
            }`}
            title={theme === "dark" ? "Cambiar a Glass" : "Cambiar a Dark"}
          >
            <Layers
              size={12}
              className={
                theme === "glass" ? "" : "text-white/60 group-hover:text-white"
              }
            />
            <span className="text-[10px] font-medium">
              {theme === "dark" ? "Dark" : t("themeGlass")}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span
            className="pointer-events-none"
            title={alwaysOnTop ? t("alwaysOnTopOn") : t("alwaysOnTopOff")}
          >
            {alwaysOnTop ? (
              <Pin size={12} className="text-accent" />
            ) : (
              <PinOff size={12} className="text-white/30" />
            )}
          </span>

          <button
            onClick={() => setPricingOpen(true)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer ${planColorClass}`}
            title={t("pricingTitle")}
          >
            <Crown size={12} />
            <span className="text-[10px] font-medium">{planName}</span>
          </button>

          {onLogout && (
            <button
              onClick={onLogout}
              className="flex items-center justify-center w-6 h-6 rounded-full text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors cursor-pointer"
              title={t("btnLogout")}
            >
              <LogOut size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Toolbar */}
      <div className="flex items-center justify-between px-3 pb-2.5 w-full gap-2">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="border-1 border-solid p-1 border-accent-border bg-accent-soft-2 rounded-xl">
            <Bot className="text-accent" size={20} />
          </div>

          <div
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full border ${quotaBadgeClass}`}
            title={
              transcriptionExceeded
                ? t("quotaExhaustedTooltip")
                : t("timeRemaining", { count: minutesLeft })
            }
          >
            <Clock size={12} />
            <span className="text-[10px] font-medium">
              {transcriptionExceeded ? "0m" : `${minutesLeft}m`}
            </span>
          </div>

          <SessionTimer />

          {onToggleScreenPanel && (
            <button
              onClick={onToggleScreenPanel}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all cursor-pointer ${
                screenPanelOpen
                  ? "bg-success-soft border border-success/40 text-success"
                  : "border border-white/10 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white"
              }`}
              title={t("screenReader")}
            >
              <Monitor size={12} />
              <span className="text-[10px] font-medium">
                {t("screenReader")}
              </span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <AudioSourceSelector />
          <LanguageSelector onChangeLanguage={onChangeLanguage} />
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {ghostMode && canUseGhostMode && (
            <div
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition-colors ${
                contentProtected && canUseInvisibleMode
                  ? "bg-danger-soft/50 border-danger/20"
                  : "bg-white/5 border-white/10"
              }`}
            >
              <Eye
                size={14}
                className={
                  contentProtected && canUseInvisibleMode
                    ? "text-danger"
                    : "text-white/40"
                }
              />
              <div>
                <div
                  className={`text-[10px] font-medium leading-tight ${contentProtected && canUseInvisibleMode ? "text-danger" : "text-white/60"}`}
                >
                  {t("ghostModeOn")}
                </div>
                <div
                  className={`text-[9px] leading-tight ${contentProtected && canUseInvisibleMode ? "text-danger/60" : "text-white/30"}`}
                >
                  {contentProtected && canUseInvisibleMode
                    ? t("ghostModeInvisibleOn")
                    : t("ghostModeInvisibleOff")}
                </div>
              </div>
            </div>
          )}
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${config.pillStyle}`}
          >
            <span className="relative flex h-2 w-2">
              <span
                className={`absolute inline-flex h-full w-full rounded-full ${config.dotColor} ${config.pulse ? "animate-ping opacity-75" : ""}`}
              />
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${config.dotColor}`}
              />
            </span>
            {t(config.labelKey as Parameters<typeof t>[0])}
            {config.showMic && (
              <svg
                className="w-3.5 h-3.5 animate-pulse"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path
                  d="M19 10v2a7 7 0 0 1-14 0v-2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <line
                  x1="12"
                  y1="19"
                  x2="12"
                  y2="23"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <line
                  x1="8"
                  y1="23"
                  x2="16"
                  y2="23"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
            )}
          </span>
        </div>
      </div>

      <PricingModal isOpen={pricingOpen} onClose={() => setPricingOpen(false)} />
    </>
  );
}

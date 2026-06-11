import { Bot, Layers, Monitor, Minus, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useInterviewStore } from "../stores/interview";
import type { Status } from "../stores/interview";
import LanguageSelector from "./LanguageSelector";
import { useTranslation } from "../hooks/useTranslation";

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
}

export default function StatusBar({ onChangeLanguage, onToggleScreenPanel }: StatusBarProps) {
  const status = useInterviewStore((s) => s.status);
  const ghostMode = useInterviewStore((s) => s.ghostMode);
  const contentProtected = useInterviewStore((s) => s.contentProtected);
  const theme = useInterviewStore((s) => s.theme);
  const screenPanelOpen = useInterviewStore((s) => s.screenPanelOpen);
  const config = statusConfig[status];
  const { t } = useTranslation();

  const handleClose = () => getCurrentWindow().close();
  const handleMinimize = () => getCurrentWindow().minimize();

  return (
    <>
      {/* Row 1: Window controls + drag region */}
      <div data-tauri-drag-region className="flex items-center justify-between pl-3 pr-3 h-[50px] shrink-0 mb-5 border-b border-white/10 bg-white/5">
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
        <span data-tauri-drag-region className="text-white/30 text-[11px] font-medium select-none">
          InterviewCopilot
        </span>
        <div className="w-[52px]" />
      </div>

      {/* Row 2: Toolbar */}
      <div className="flex items-center justify-between px-3 pb-2.5 w-full gap-2">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="border-1 border-solid p-1 border-accent-border bg-accent-soft-2 rounded-xl">
            <Bot className="text-accent" size={20} />
          </div>

          <button
            onClick={() => useInterviewStore.getState().setTheme(theme === "dark" ? "glass" : "dark")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all group ${
              theme === "glass"
                ? "glass-button-active"
                : "border border-white/10 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white cursor-pointer"
            }`}
            title={theme === "dark" ? "Cambiar a Glass" : "Cambiar a Dark"}
          >
            <Layers size={12} className={theme === "glass" ? "" : "text-white/60 group-hover:text-white"} />
            <span className="text-[10px] font-medium">
              {theme === "dark" ? "Dark" : t("themeGlass")}
            </span>
          </button>

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
              <span className="text-[10px] font-medium">{t("screenReader")}</span>
            </button>
          )}
        </div>

        <LanguageSelector onChangeLanguage={onChangeLanguage} />

        <div className="flex items-center gap-1.5 shrink-0">
          {ghostMode && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-danger-soft text-danger border border-danger/30 animate-pulse">
              {t("ghostModeOn")}
            </span>
          )}
          {contentProtected && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-accent-soft text-accent border border-accent-border">
              {t("contentProtected")}
            </span>
          )}
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${config.pillStyle}`}>
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
              <svg className="w-3.5 h-3.5 animate-pulse" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" fill="none" stroke="currentColor" strokeWidth="2" />
                <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" strokeWidth="2" />
                <line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" strokeWidth="2" />
              </svg>
            )}
          </span>
        </div>
      </div>
    </>
  );
}
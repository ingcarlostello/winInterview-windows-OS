import { Bot, Layers, Monitor } from "lucide-react";
import { useInterviewStore } from "../stores/interview";
import type { Status } from "../stores/interview";
import LanguageSelector from "./LanguageSelector";
import { useTranslation } from "../hooks/useTranslation";

const statusConfig: Record<Status, { labelKey: string; color: string; pulse: boolean; showMic: boolean }> = {
  idle: { labelKey: "statusDisconnected", color: "bg-gray-500", pulse: false, showMic: false },
  connected: { labelKey: "statusReady", color: "bg-green-500", pulse: false, showMic: false },
  listening: { labelKey: "statusListening", color: "bg-green-500", pulse: true, showMic: true },
  thinking: { labelKey: "statusThinking", color: "bg-green-500", pulse: true, showMic: true },
  responding: { labelKey: "statusResponding", color: "bg-green-500", pulse: false, showMic: true },
  paused: { labelKey: "statusPaused", color: "bg-orange-500", pulse: false, showMic: false },
  reconnecting: { labelKey: "statusReconnecting", color: "bg-yellow-500", pulse: true, showMic: false },
  capturing: { labelKey: "statusCapturing", color: "bg-green-500", pulse: true, showMic: false },
  error: { labelKey: "statusDisconnected", color: "bg-red-500", pulse: false, showMic: false },
};

interface StatusBarProps {
  onChangeLanguage?: (language: string) => void;
  onToggleScreenPanel?: () => void;
}

export default function StatusBar({ onChangeLanguage, onToggleScreenPanel }: StatusBarProps) {
  const status = useInterviewStore((s) => s.status);
  const error = useInterviewStore((s) => s.error);
  const ghostMode = useInterviewStore((s) => s.ghostMode);
  const contentProtected = useInterviewStore((s) => s.contentProtected);
  const theme = useInterviewStore((s) => s.theme);
  const config = statusConfig[status];
  const screenPanelOpen = useInterviewStore((s) => s.screenPanelOpen);
  const { t } = useTranslation();

  return (
    <div data-tauri-drag-region className="flex items-center justify-between px-3 py-2.5 w-full gap-2">
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="border-1 border-solid p-1 border-green-500/30 bg-green-500/10 rounded-xl">
            <Bot className="text-green-500" size={20} />
          </div>
          <span className="text-white font-semibold text-xs">InterviewCopilot</span>
        </div>
        
        <button
          onClick={() => useInterviewStore.getState().setTheme(theme === "dark" ? "liquid" : "dark")}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all group ${
            theme === "liquid" 
              ? "glass-button" 
              : "border border-white/10 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white cursor-pointer"
          }`}
          title={theme === "dark" ? "Cambiar a Liquid Glass" : "Cambiar a Dark"}
        >
          <Layers size={12} className={theme === "liquid" ? "" : "text-white/60 group-hover:text-white"} />
          <span className="text-[10px] font-medium">
            {theme === "dark" ? "Dark" : "Liquid"}
          </span>
        </button>

        {onToggleScreenPanel && (
          <button
            onClick={onToggleScreenPanel}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all cursor-pointer ${
              screenPanelOpen
                ? "bg-green-500/15 border border-green-500/30 text-green-400"
                : "border border-white/10 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white"
            }`}
            //title={t("screenReader")}
            title={"lector 1"}
          >
            <Monitor size={12} />
            <span className="text-[10px] font-medium">{t("screenReader")}</span>
          </button>
        )}
      </div>
      <LanguageSelector onChangeLanguage={onChangeLanguage} />
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Stealth indicators */}
        {ghostMode && (
          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 animate-pulse">
            {t("ghostModeOn")}
          </span>
        )}
        {contentProtected && (
          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
            {t("contentProtected")}
          </span>
        )}
        {/* Status dot */}
        <span className="relative flex h-2 w-2">
          <span
            className={`absolute inline-flex h-full w-full rounded-full ${config.color} ${config.pulse ? "animate-ping opacity-75" : ""}`}
          />
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${config.color}`}
          />
        </span>
        <span className={`text-xs font-medium ${status === "error" ? "text-red-400" : "text-white/70"}`}>
          {t(config.labelKey as Parameters<typeof t>[0])}
        </span>
        {config.showMic && (
          <svg className="w-3.5 h-3.5 text-green-400 animate-pulse" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" fill="none" stroke="currentColor" strokeWidth="2" />
            <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" strokeWidth="2" />
            <line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" strokeWidth="2" />
          </svg>
        )}
      </div>
      {error && (
        <span className="text-red-400 truncate max-w-[120px] text-xs">
          {error}
        </span>
      )}
    </div>
  );
}


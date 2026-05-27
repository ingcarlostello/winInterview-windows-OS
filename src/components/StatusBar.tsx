import { Bot } from "lucide-react";
import { useInterviewStore } from "../stores/interview";
import type { Status } from "../stores/interview";

const statusConfig: Record<Status, { label: string; color: string; pulse: boolean; showMic: boolean }> = {
  idle: { label: "Desconectado", color: "bg-gray-500", pulse: false, showMic: false },
  connected: { label: "Listo", color: "bg-green-500", pulse: false, showMic: false },
  listening: { label: "Escuchando", color: "bg-green-500", pulse: true, showMic: true },
  thinking: { label: "Pensando...", color: "bg-green-500", pulse: true, showMic: true },
  responding: { label: "Respondiendo", color: "bg-green-500", pulse: false, showMic: true },
  paused: { label: "Pausado", color: "bg-orange-500", pulse: false, showMic: false },
  error: { label: "Error", color: "bg-red-500", pulse: false, showMic: false },
};

export default function StatusBar() {
  const status = useInterviewStore((s) => s.status);
  const error = useInterviewStore((s) => s.error);
  const config = statusConfig[status];

  return (
    <div data-tauri-drag-region className="flex items-center justify-between px-3 py-2.5 w-full">
      <div className="flex items-center gap-2">
        <div className="border-1 border-solid p-1 border-green-500/30 bg-green-500/10 rounded-xl">
          <Bot className="text-green-500" size={20} />
        </div>
        <span className="text-white font-semibold text-xs">Interview Copilot</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span
            className={`absolute inline-flex h-full w-full rounded-full ${config.color} ${config.pulse ? "animate-ping opacity-75" : ""}`}
          />
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${config.color}`}
          />
        </span>
        <span className={`text-xs font-medium ${status === "error" ? "text-red-400" : "text-white/70"}`}>
          {config.label}
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

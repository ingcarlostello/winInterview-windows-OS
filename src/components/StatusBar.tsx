import { useInterviewStore } from "../stores/interview";
import type { Status } from "../stores/interview";

const statusConfig: Record<Status, { label: string; color: string; pulse: boolean }> = {
  idle: { label: "Desconectado", color: "bg-gray-400", pulse: false },
  connected: { label: "Conectando...", color: "bg-yellow-400", pulse: true },
  listening: { label: "Escuchando", color: "bg-green-400", pulse: true },
  thinking: { label: "Pensando...", color: "bg-blue-400", pulse: true },
  responding: { label: "Respondiendo", color: "bg-purple-400", pulse: false },
  paused: { label: "Pausado", color: "bg-orange-400", pulse: false },
  error: { label: "Error", color: "bg-red-400", pulse: false },
};

export default function StatusBar() {
  const status = useInterviewStore((s) => s.status);
  const error = useInterviewStore((s) => s.error);
  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-2 px-3 py-2 text-xs">
      <span className="relative flex h-2 w-2">
        <span
          className={`absolute inline-flex h-full w-full rounded-full ${config.color} ${config.pulse ? "animate-ping opacity-75" : ""}`}
        />
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${config.color}`}
        />
      </span>
      <span className="text-white/80 font-medium">{config.label}</span>
      {error && (
        <span className="text-red-400 truncate ml-auto max-w-[200px]">
          {error}
        </span>
      )}
    </div>
  );
}

import { useInterviewStore } from "../stores/interview";

interface ControlsProps {
  onPause: () => void;
  onResume: () => void;
  onClear: () => void;
  onConnect: () => void;
}

export default function Controls({ onPause, onResume, onClear, onConnect }: ControlsProps) {
  const status = useInterviewStore((s) => s.status);
  const isPaused = status === "paused";

  console.log("status ===>", status);


  return (
    <div className="flex items-center gap-1.5 ml-auto pr-3 h-16">
      {status === "idle" || status === "error" ? (
        <button
          type="button"
          onClick={onConnect}
          className="px-2 py-0.5 text-[14px] font-medium rounded transition-colors cursor-pointer bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
          title="Conectar a la sesión"
        >
          🔌 Conectar
        </button>
      ) : status === "connected" ? (
        <button
          type="button"
          disabled
          className="px-2 py-0.5 text-[14px] font-medium rounded transition-colors cursor-not-allowed bg-yellow-500/10 text-yellow-500/50"
          title="Estableciendo conexión..."
        >
          ⏳ Conectando...
        </button>
      ) : (
        <button
          type="button"
          onClick={() => (isPaused ? onResume() : onPause())}
          className={`px-2 py-0.5 text-[14px] font-medium rounded transition-colors cursor-pointer ${isPaused
            ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
            : "bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30"
            }`}
          title={isPaused ? "Reanudar escucha" : "Pausar escucha"}
        >
          {isPaused ? "▶ Reanudar" : "⏸ Pausar"}
        </button>
      )}
      <button
        type="button"
        onClick={onClear}
        className="px-2 py-0.5 text-[14px] font-medium text-white/50 hover:text-white/80 hover:bg-white/10 rounded transition-colors cursor-pointer"
        title="Limpiar historial"
      >
        Limpiar
      </button>
    </div>
  );
}

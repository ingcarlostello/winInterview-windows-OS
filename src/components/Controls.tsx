import { useInterviewStore } from "../stores/interview";

interface ControlsProps {
  onPause: () => void;
  onResume: () => void;
  onClear: () => void;
}

export default function Controls({ onPause, onResume, onClear }: ControlsProps) {
  const status = useInterviewStore((s) => s.status);
  const isPaused = status === "paused";

  return (
    <div className="flex items-center gap-1.5 ml-auto pr-3">
      <button
        type="button"
        onClick={() => (isPaused ? onResume() : onPause())}
        className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors cursor-pointer ${
          isPaused
            ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
            : "bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30"
        }`}
        title={isPaused ? "Reanudar escucha" : "Pausar escucha"}
      >
        {isPaused ? "▶ Reanudar" : "⏸ Pausar"}
      </button>
      <button
        type="button"
        onClick={onClear}
        className="px-2 py-0.5 text-[10px] font-medium text-white/50 hover:text-white/80 hover:bg-white/10 rounded transition-colors cursor-pointer"
        title="Limpiar historial"
      >
        Limpiar
      </button>
    </div>
  );
}

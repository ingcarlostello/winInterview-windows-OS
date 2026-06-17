import { useState, useEffect, useRef } from "react";
import { Timer } from "lucide-react";
import { useInterviewStore } from "../stores/interview";
import { useTranslation } from "../hooks/useTranslation";

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export default function SessionTimer() {
  const sessionStartTime = useInterviewStore((s) => s.sessionStartTime);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (sessionStartTime === null) {
      return;
    }

    const update = () => {
      setElapsed(Math.floor((Date.now() - sessionStartTime) / 1000));
    };

    update();
    intervalRef.current = setInterval(update, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [sessionStartTime]);

  if (sessionStartTime === null) return null;

  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-accent/40 bg-accent-soft text-accent"
      title={t("sessionTimeTooltip")}
    >
      <Timer size={12} />
      <span className="text-[10px] font-medium tabular-nums">
        {formatDuration(elapsed)}
      </span>
    </div>
  );
}

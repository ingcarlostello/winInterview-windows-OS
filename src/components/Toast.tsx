import { useEffect } from "react";
import { CheckCircle2, Info, X } from "lucide-react";
import { useInterviewStore } from "../stores/interview";

const TOAST_DURATION_MS = 5_000;

export default function Toast() {
  const toast = useInterviewStore((s) => s.toast);
  const clearToast = useInterviewStore((s) => s.clearToast);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => clearToast(), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast, clearToast]);

  if (!toast) return null;

  const isSuccess = toast.type === "success";

  return (
    <div
      className="fixed bottom-4 left-1/2 z-50"
      style={{ animation: "fadeInUp 0.3s ease-out" }}
    >
      <div
        className={`flex items-center gap-3 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-xl ${
          isSuccess
            ? "border-green-500/40 bg-green-500/15 text-green-300"
            : "border-amber-500/40 bg-amber-500/15 text-amber-300"
        }`}
      >
        {isSuccess ? (
          <CheckCircle2 size={18} className="shrink-0" />
        ) : (
          <Info size={18} className="shrink-0" />
        )}
        <span className="text-sm font-medium">{toast.message}</span>
        <button
          onClick={clearToast}
          className="ml-1 shrink-0 rounded-md p-0.5 hover:bg-white/10 transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

import { MessageSquare, CircleDot } from "lucide-react";
import { useInterviewStore } from "../stores/interview";
import { useTranslation } from "../hooks/useTranslation";

export default function Transcription() {
  const transcription = useInterviewStore((s) => s.transcription);
  const status = useInterviewStore((s) => s.status);
  const { t } = useTranslation();

  const hasContent = !!transcription || status === "thinking";
  const charCount = transcription.length;

  return (
    <div className="px-3 pb-2">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 mt-1">
          <MessageSquare className="w-3.5 h-3.5 text-accent/80" />
          <p className="text-[10px] uppercase tracking-wider text-accent/80 font-medium">
            {t("interviewer")}
          </p>
        </div>
        <span className="text-[9px] uppercase tracking-wider text-white/30 bg-white/5 px-2 py-0.5 rounded-full font-medium">
          {t("charsBadge", { count: charCount })}
        </span>
      </div>
      <div className="border border-dashed border-white/10 rounded-lg bg-black/30 px-3 py-2 min-h-[48px]">
        {hasContent ? (
          <p className="text-sm leading-relaxed text-white/90">
            {transcription}
          </p>
        ) : (
          <div className="flex flex-col items-center justify-center gap-1.5 py-3">
            <CircleDot className="w-5 h-5 text-white/15" />
            <p className="text-[13px] text-white/25 font-medium">
              {t("waitingQuestion")}
            </p>
            <p className="text-[9px] uppercase tracking-widest text-white/15 font-semibold">
              {t("pressListenToStart")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
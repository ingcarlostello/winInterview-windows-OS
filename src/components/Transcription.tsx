import { MessageSquare, CircleDot, Headphones } from "lucide-react";
import { useInterviewStore } from "../stores/interview";
import { useTranslation } from "../hooks/useTranslation";
import { useFeatureGate } from "../hooks/useFeatureGate";

export default function Transcription() {
  const transcription = useInterviewStore((s) => s.transcription);
  const status = useInterviewStore((s) => s.status);
  const { t } = useTranslation();
  const { allowed: canUseSystemAudio } = useFeatureGate("system_audio_capture");

  const hasContent = !!transcription || status === "thinking";
  const charCount = transcription.length;
  // Mic-only plans fail with headphones (the mic never hears the interviewer).
  // Surface a visible hint while waiting so users don't think it's broken.
  const showMicHint = !canUseSystemAudio && !hasContent;

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
      {showMicHint && (
        <div className="flex items-start gap-1.5 mt-1.5 px-2 py-1.5 rounded-lg border border-amber/20 bg-amber/10">
          <Headphones size={12} className="text-amber mt-0.5 shrink-0" />
          <p className="text-[10px] leading-tight text-amber/80">
            {t("audioSourceMicHint")}
          </p>
        </div>
      )}
    </div>
  );
}
import { useInterviewStore } from "../stores/interview";

export default function Transcription() {
  const transcription = useInterviewStore((s) => s.transcription);
  const status = useInterviewStore((s) => s.status);

  const hasContent = transcription || status === "thinking";

  return (
    <div className="px-3 pb-2">
      <p className="text-[10px] mt-1 uppercase tracking-wider text-white/40 mb-1.5 font-medium">
        Entrevistador
      </p>
      <div className="border border-green-500/30 rounded-lg bg-black/30 px-3 py-2 min-h-[48px]">
        <p className={`text-sm leading-relaxed ${hasContent ? "text-white/90" : "text-[14px] text-white/20 italic"}`}>
          {transcription || "Inicia para capturar audio"}
        </p>
      </div>
    </div>
  );
}

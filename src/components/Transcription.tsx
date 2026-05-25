import { useInterviewStore } from "../stores/interview";

export default function Transcription() {
  const transcription = useInterviewStore((s) => s.transcription);
  const status = useInterviewStore((s) => s.status);

  if (!transcription && status !== "thinking") return null;

  return (
    <div className="px-3 py-2 border-b border-white/10">
      <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1">
        Entrevistador
      </p>
      <p className="text-white/90 text-sm leading-relaxed">{transcription || "..."}</p>
    </div>
  );
}

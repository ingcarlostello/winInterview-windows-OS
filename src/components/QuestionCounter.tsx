import { useInterviewStore } from "../stores/interview";

export default function QuestionCounter() {
  const questionsAnswered = useInterviewStore((s) => s.questionsAnswered);

  if (questionsAnswered === 0) return null;

  const label = questionsAnswered === 1
    ? "1 pregunta respondida"
    : `${questionsAnswered} preguntas respondidas`;

  return (
    <div className="px-3 py-1.5 text-[11px] text-green-400/50">
      • {label}
    </div>
  );
}

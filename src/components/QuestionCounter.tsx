import { useInterviewStore } from "../stores/interview";
import { useTranslation } from "../hooks/useTranslation";

export default function QuestionCounter() {
  const questionsAnswered = useInterviewStore((s) => s.questionsAnswered);
  const { t } = useTranslation();

  if (questionsAnswered === 0) return null;

  const label = questionsAnswered === 1
    ? t("questionSingular")
    : t("questionPlural", { count: questionsAnswered });

  return (
    <div className="px-3 py-1.5 text-[11px] text-green-400/50">
      • {label}
    </div>
  );
}

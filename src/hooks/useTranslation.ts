import { useCallback } from "react";
import { useInterviewStore } from "../stores/interview";
import type { TranslationKey } from "../i18n/translations";
import { t as translate } from "../i18n/translations";

export function useTranslation() {
  const language = useInterviewStore((s) => s.language);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) =>
      translate(key, language, params),
    [language],
  );

  return { t, language };
}

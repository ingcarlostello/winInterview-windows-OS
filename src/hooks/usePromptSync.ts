import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useInterviewStore } from "../stores/interview";

export function usePromptSync() {
  const convexPrompts = useQuery(api.prompts.getMyPrompts);
  const setCustomPrompt = useInterviewStore((s) => s.setCustomPrompt);
  const hydratedRef = useRef<Record<string, boolean>>({ es: false, en: false });

  useEffect(() => {
    if (!convexPrompts) return;

    const { es, en } = convexPrompts as { es: string; en: string };

    for (const [lang, text] of [["es", es], ["en", en]] as const) {
      if (hydratedRef.current[lang]) continue;

      const store = useInterviewStore.getState();
      const hasLocal = Boolean(store.customPrompts[lang]?.trim());

      if (text?.trim() && !hasLocal) {
        setCustomPrompt(lang, text);
      } else if (!text?.trim() && !hasLocal) {
        hydratedRef.current[lang] = true;
      } else if (hasLocal) {
        hydratedRef.current[lang] = true;
      }
    }
  }, [convexPrompts, setCustomPrompt]);
}

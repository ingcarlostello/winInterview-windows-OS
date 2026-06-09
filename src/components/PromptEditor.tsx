import { useState, useEffect, useRef } from "react";
import { Sliders, Check, RotateCcw, X } from "lucide-react";
import { useInterviewStore } from "../stores/interview";
import { useTranslation } from "../hooks/useTranslation";

interface PromptEditorProps {
  onSave: (prompt: string) => void;
  onRestore: () => void;
}

export default function PromptEditor({ onSave, onRestore }: PromptEditorProps) {
  const { t } = useTranslation();
  const language = useInterviewStore((s) => s.language);
  const customPrompts = useInterviewStore((s) => s.customPrompts);
  const showPromptEditor = useInterviewStore((s) => s.showPromptEditor);
  const togglePromptEditor = useInterviewStore((s) => s.togglePromptEditor);
  const theme = useInterviewStore((s) => s.theme);

  const [draft, setDraft] = useState(() => customPrompts[language] || "");
  const [saved, setSaved] = useState(false);
  const [restored, setRestored] = useState(false);
  const prevLangRef = useRef(language);

  useEffect(() => {
    if (prevLangRef.current !== language) {
      setDraft(customPrompts[language] || "");
      prevLangRef.current = language;
    }
  }, [language, customPrompts]);

  const handleSave = () => {
    if (draft.trim()) {
      onSave(draft.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const handleRestore = () => {
    console.log("[PromptEditor] handleRestore called, draft was:", draft.substring(0, 50));
    onRestore();
    setDraft("");
    setRestored(true);
    setTimeout(() => setRestored(false), 2000);
  };

  if (!showPromptEditor) {
    return (
      <div className="px-3 py-1">
        <button
          type="button"
          onClick={togglePromptEditor}
          className={`flex items-center gap-1.5 transition-colors cursor-pointer ${
            theme === "liquid"
              ? "glass-button px-2.5 py-1 rounded-full text-xs font-medium"
              : "px-2 py-1 text-[10px] uppercase tracking-wider text-white/40 hover:text-white/70"
          }`}
        >
          <Sliders size={11} />
          {t("btnTogglePrompt")}
        </button>
      </div>
    );
  }

  return (
    <div className="px-3 py-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider text-white/40 flex items-center gap-1.5">
          <Sliders size={11} />
          {t("customContext")}
          {customPrompts[language]?.trim() && (
            <span className="text-[9px] text-green-400/70 ml-1">
              {t("activePromptIndicator")}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={togglePromptEditor}
          className="text-white/30 hover:text-white/60 transition-colors cursor-pointer"
        >
          <X size={12} />
        </button>
      </div>
      <div className={`bg-white/5 border rounded-lg p-2 transition-colors ${
        customPrompts[language]?.trim() ? "border-green-500/30" : "border-white/10"
      }`}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("placeholderPrompt")}
          className="w-full h-20 bg-transparent text-xs text-white/80 placeholder:text-white/25 resize-none outline-none scrollbar-thin"
        />
        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={!draft.trim()}
            className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded transition-colors cursor-pointer ${
              theme === "liquid"
                ? "glass-button disabled:opacity-40 disabled:cursor-not-allowed"
                : saved
                  ? "bg-green-500/30 text-green-400"
                  : "bg-green-500/20 border border-green-500/30 text-green-400 hover:bg-green-500/40 disabled:opacity-40 disabled:cursor-not-allowed"
            }`}
          >
            <Check size={10} />
            {saved ? t("promptSaved") : t("btnSave")}
          </button>
          <button
            type="button"
            onClick={handleRestore}
            className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded transition-colors cursor-pointer ${
              theme === "liquid"
                ? "glass-button"
                : restored 
                  ? "bg-white/10 text-white/70 border border-white/10" 
                  : "border border-white/10 text-white/50 hover:text-white/70 hover:bg-white/10"
            }`}
          >
            <RotateCcw size={10} />
            {restored ? t("promptRestored") : t("btnRestoreDefault")}
          </button>
        </div>
      </div>
    </div>
  );
}

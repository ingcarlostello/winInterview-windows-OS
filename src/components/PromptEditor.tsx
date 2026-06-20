import { useState, useEffect, useRef } from "react";
import { Sliders, Check, RotateCcw, ChevronDown, Lock } from "lucide-react";
import { useInterviewStore } from "../stores/interview";
import { useTranslation } from "../hooks/useTranslation";
import { useFeatureGate } from "../hooks/useFeatureGate";

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
  const { allowed: canUseCustomPrompts } = useFeatureGate("custom_prompts");

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

  if (!canUseCustomPrompts) {
    return (
      <div className="px-3 mb-6 mt-2">
        <div className={`flex items-center justify-between px-3 py-2 rounded-xl mt-4 opacity-60 ${
          theme === "glass"
            ? "glass-button-active"
            : "bg-white/5 border border-white/10"
        }`}>
          <div className="flex items-center gap-2">
            <Lock size={14} className="text-white/40" />
            <span className="text-xs font-medium text-white/60 uppercase tracking-wider">
              {t("btnTogglePrompt")}
            </span>
            <span className="px-1.5 py-0.5 text-[9px] font-medium rounded-full bg-accent-soft text-accent">
              Pro
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 mb-6 mt-2">
      <button
        type="button"
        onClick={togglePromptEditor}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-colors cursor-pointer mt-4 ${
          theme === "glass"
            ? "glass-button-active"
            : "bg-white/5 border border-white/10 hover:bg-white/10"
        }`}
      >
        <div className="flex items-center gap-2">
          <Sliders size={14} className="text-white/40" />
          <span className="text-xs font-medium text-white/60 uppercase tracking-wider">
            {t("btnTogglePrompt")}
          </span>
          {customPrompts[language]?.trim() && showPromptEditor && (
            <span className="px-1.5 py-0.5 text-[9px] font-medium rounded-full bg-accent-soft text-accent">
              {t("activePromptIndicator")}
            </span>
          )}
        </div>
        <ChevronDown
          size={14}
          className={`text-white/40 transition-transform duration-300 ${showPromptEditor ? "rotate-180" : ""}`}
        />
      </button>

      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${showPromptEditor ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="pt-3">
            <div className={`rounded-xl border p-3 transition-colors ${
              customPrompts[language]?.trim() ? "bg-accent-soft/30 border-accent-border" : "bg-white/5 border-white/10"
            }`}>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t("placeholderPrompt")}
                className="w-full h-28 bg-transparent text-xs text-white/80 placeholder:text-white/25 resize-none outline-none scrollbar-thin"
              />
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!draft.trim()}
                  className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded-lg transition-colors cursor-pointer ${
                    theme === "glass"
                      ? "glass-button-active disabled:opacity-40 disabled:cursor-not-allowed"
                      : saved
                        ? "bg-accent/30 text-accent"
                        : "bg-accent-soft border border-accent-border text-accent hover:bg-accent/40 disabled:opacity-40 disabled:cursor-not-allowed"
                  }`}
                >
                  <Check size={10} />
                  {saved ? t("promptSaved") : t("btnSave")}
                </button>
                <button
                  type="button"
                  onClick={handleRestore}
                  className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded-lg transition-colors cursor-pointer ${
                    theme === "glass"
                      ? "glass-button-active"
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
        </div>
      </div>
    </div>
  );
}

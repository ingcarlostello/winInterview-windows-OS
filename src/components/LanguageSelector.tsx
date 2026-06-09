import { useState, useEffect, useRef } from "react";
import { ChevronDown, Check } from "lucide-react";
import { useInterviewStore } from "../stores/interview";
import type { Language } from "../stores/interview";

interface LanguageOption {
  code: Language;
  flag: string;
  label: string;
}

const options: LanguageOption[] = [
  { code: "es", flag: "🇪🇸", label: "Español" },
  { code: "en", flag: "🇺🇸", label: "English" },
];

interface LanguageSelectorProps {
  disabled?: boolean;
  onChangeLanguage?: (code: Language) => void;
}

export default function LanguageSelector({ disabled = false, onChangeLanguage }: LanguageSelectorProps) {
  const language = useInterviewStore((s) => s.language);
  const setLanguage = useInterviewStore((s) => s.setLanguage);
  const theme = useInterviewStore((s) => s.theme);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const current = options.find((o) => o.code === language)!;

  const handleSelect = (code: Language) => {
    setLanguage(code);
    onChangeLanguage?.(code);
    setOpen(false);
  };

  const buttonDisabled = disabled || false;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !buttonDisabled && setOpen(!open)}
        disabled={buttonDisabled}
        className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
          buttonDisabled
            ? "border border-white/5 bg-white/5 text-white/30 cursor-not-allowed"
            : theme === "liquid"
              ? "glass-button"
              : "border border-white/15 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white cursor-pointer"
        }`}
      >
        <span className="text-sm leading-none">{current.flag}</span>
        <span>{current.label}</span>
        <ChevronDown
          size={12}
          className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-40 bg-black/80 backdrop-blur-xl border border-white/15 rounded-xl shadow-2xl overflow-hidden z-50">
          {options.map((option) => (
            <button
              key={option.code}
              type="button"
              onClick={() => handleSelect(option.code)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors cursor-pointer ${
                option.code === language
                  ? "bg-white/10 text-white"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="w-4 flex items-center justify-center">
                {option.code === language && <Check size={12} className="text-green-400" />}
              </span>
              <span className="text-sm">{option.flag}</span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

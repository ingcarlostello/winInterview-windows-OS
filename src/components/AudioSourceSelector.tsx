import { useState, useEffect, useRef } from "react";
import { ChevronDown, Check, Lock, Mic, Speaker, Layers2 } from "lucide-react";
import { useInterviewStore } from "../stores/interview";
import type { AudioSource } from "../stores/slices/settingsSlice";
import { useTranslation } from "../hooks/useTranslation";
import { useFeatureGate } from "../hooks/useFeatureGate";
import type { TranslationKey } from "../i18n/translations";

interface SourceOption {
  code: AudioSource;
  icon: typeof Mic;
  labelKey: TranslationKey;
  descKey: TranslationKey;
}

const options: SourceOption[] = [
  { code: "mic", icon: Mic, labelKey: "audioSourceMic", descKey: "audioSourceMicDesc" },
  { code: "system", icon: Speaker, labelKey: "audioSourceSystem", descKey: "audioSourceSystemDesc" },
  { code: "both", icon: Layers2, labelKey: "audioSourceBoth", descKey: "audioSourceBothDesc" },
];

export default function AudioSourceSelector() {
  const audioSource = useInterviewStore((s) => s.audioSource);
  const setAudioSource = useInterviewStore((s) => s.setAudioSource);
  const status = useInterviewStore((s) => s.status);
  const theme = useInterviewStore((s) => s.theme);
  const { t } = useTranslation();
  const { allowed } = useFeatureGate("system_audio_capture");
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

  // The source is read when the WebSocket connects, so it can only change while
  // disconnected (idle/error). Locked entirely for non-Ultra plans.
  const canEdit = allowed && (status === "idle" || status === "error");
  const current = options.find((o) => o.code === audioSource) ?? options[0];
  const CurrentIcon = current.icon;

  const handleSelect = (code: AudioSource) => {
    setAudioSource(code);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => canEdit && setOpen(!open)}
        disabled={!canEdit}
        title={allowed ? t("audioSourceLabel") : t("audioSourceUltraTooltip")}
        className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
          !canEdit
            ? "border border-white/5 bg-white/5 text-white/30 cursor-not-allowed"
            : theme === "glass"
              ? "glass-button-active"
              : "border border-white/15 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white cursor-pointer"
        }`}
      >
        {allowed ? <CurrentIcon size={12} /> : <Lock size={12} />}
        <span>{allowed ? t(current.labelKey) : t("audioSourceMic")}</span>
        {allowed && (
          <ChevronDown
            size={12}
            className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-64 bg-black/80 backdrop-blur-xl border border-white/15 rounded-xl shadow-2xl overflow-hidden z-50">
          {options.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.code}
                type="button"
                onClick={() => handleSelect(option.code)}
                className={`w-full flex items-start gap-2 px-3 py-2 text-left transition-colors cursor-pointer ${
                  option.code === audioSource
                    ? "bg-white/10 text-white"
                    : "text-white/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className="w-4 flex items-center justify-center mt-0.5">
                  {option.code === audioSource && <Check size={12} className="text-accent" />}
                </span>
                <Icon size={14} className="mt-0.5 shrink-0" />
                <span className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium">{t(option.labelKey)}</span>
                  <span className="text-[10px] leading-tight text-white/40">
                    {t(option.descKey)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

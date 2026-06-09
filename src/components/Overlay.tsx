import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useInterviewStore } from "../stores/interview";
import StatusBar from "./StatusBar";
import Transcription from "./Transcription";
import Response from "./Response";
import Controls from "./Controls";
import QuestionCounter from "./QuestionCounter";
import PromptEditor from "./PromptEditor";

interface OverlayProps {
  onPause: () => void;
  onResume: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onSavePrompt: (prompt: string) => void;
  onRestorePrompt: () => void;
  onChangeLanguage: (language: string) => void;
}

export default function Overlay({
  onPause,
  onResume,
  onConnect,
  onDisconnect,
  onSavePrompt,
  onRestorePrompt,
  onChangeLanguage,
}: OverlayProps) {
  const status = useInterviewStore((s) => s.status);
  const ghostMode = useInterviewStore((s) => s.ghostMode);
  const setGhostMode = useInterviewStore((s) => s.setGhostMode);
  const setContentProtected = useInterviewStore((s) => s.setContentProtected);
  const theme = useInterviewStore((s) => s.theme);
  const isActive = status === "listening" || status === "thinking" || status === "responding";

  // Listen for Tauri events from the Rust layer
  useEffect(() => {
    const unlistenGhost = listen<boolean>("ghost-mode-changed", (event) => {
      setGhostMode(event.payload);
    });
    const unlistenProtect = listen<boolean>("content-protected-changed", (event) => {
      setContentProtected(event.payload);
    });
    return () => {
      unlistenGhost.then((fn) => fn());
      unlistenProtect.then((fn) => fn());
    };
  }, [setGhostMode, setContentProtected]);

  const isLiquid = theme === "liquid";

  const bgClass = isLiquid ? "glass-base" : "bg-black/60 backdrop-blur-xl";
  
  const borderClass = ghostMode
    ? "border-cyan-400/50"
    : isLiquid 
      ? (isActive ? "border-green-400/60" : "")
      : (isActive ? "border-green-500/30" : "border-white/10");

  const auraClass = isActive 
    ? (isLiquid ? "liquid-aura-active" : "aura-active") 
    : (isLiquid && !ghostMode ? "liquid-idle-aura" : "");

  return (
    <div className={`shadow-[0px_8px_48px_-8px_rgba(120,160,255,0.2),0px_2px_16px_rgba(255,255,255,0.06)] h-full w-full flex flex-col ${bgClass} rounded-2xl border shadow-2xl transition-all duration-500 ${borderClass} ${auraClass} ${ghostMode ? "ghost-active" : ""}`}>
      <StatusBar onChangeLanguage={onChangeLanguage} />
      <div className="border-b border-white/10" />
      <Controls onPause={onPause} onResume={onResume} onConnect={onConnect} onDisconnect={onDisconnect} />
      <div className="border-b border-white/10 mx-3" />
      <PromptEditor onSave={onSavePrompt} onRestore={onRestorePrompt} onConnect={onConnect} />
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden pt-2">
        <Transcription />
        <Response />
      </div>
      <QuestionCounter />
    </div>
  );
}


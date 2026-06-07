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
}

export default function Overlay({
  onPause,
  onResume,
  onConnect,
  onDisconnect,
  onSavePrompt,
  onRestorePrompt,
}: OverlayProps) {
  const status = useInterviewStore((s) => s.status);
  const ghostMode = useInterviewStore((s) => s.ghostMode);
  const setGhostMode = useInterviewStore((s) => s.setGhostMode);
  const setContentProtected = useInterviewStore((s) => s.setContentProtected);
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

  const borderClass = ghostMode
    ? "border-cyan-400/50"
    : isActive
      ? "border-green-500/30"
      : "border-white/10";

  return (
    <div className={`h-full w-full flex flex-col bg-black/60 backdrop-blur-xl rounded-2xl border shadow-2xl transition-all duration-500 ${borderClass} ${isActive ? "aura-active" : ""} ${ghostMode ? "ghost-active" : ""}`}>
      <StatusBar />
      <div className="border-b border-white/10" />
      <Controls onPause={onPause} onResume={onResume} onConnect={onConnect} onDisconnect={onDisconnect} />
      <div className="border-b border-white/10 mx-3" />
      <PromptEditor onSave={onSavePrompt} onRestore={onRestorePrompt} />
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden pt-2">
        <Transcription />
        <Response />
      </div>
      <QuestionCounter />
    </div>
  );
}


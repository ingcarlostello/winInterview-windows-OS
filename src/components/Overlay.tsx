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
  const isActive = status === "listening" || status === "thinking" || status === "responding";

  return (
    <div className={`h-full w-full flex flex-col bg-black/60 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl transition-shadow duration-500 ${isActive ? "aura-active border-green-500/30" : ""}`}>
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

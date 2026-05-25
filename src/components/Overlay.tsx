import StatusBar from "./StatusBar";
import Transcription from "./Transcription";
import Response from "./Response";
import Controls from "./Controls";

interface OverlayProps {
  onPause: () => void;
  onResume: () => void;
  onClear: () => void;
}

export default function Overlay({ onPause, onResume, onClear }: OverlayProps) {
  return (
    <div className="h-full w-full flex flex-col bg-black/50 backdrop-blur-xl rounded-xl border border-white/10 shadow-2xl">
      <div className="flex items-center border-b border-white/10">
        <StatusBar />
        <Controls onPause={onPause} onResume={onResume} onClear={onClear} />
      </div>
      <Transcription />
      <Response />
    </div>
  );
}

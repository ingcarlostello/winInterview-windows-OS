import Overlay from "./components/Overlay";
import { useWebSocket } from "./hooks/useWebSocket";

export default function App() {
  const { send, disconnect, connect, setPrompt, restoreDefaultPrompt } = useWebSocket();

  return (
    <Overlay
      onPause={() => send("pause")}
      onResume={() => send("resume")}
      onConnect={connect}
      onDisconnect={disconnect}
      onSavePrompt={setPrompt}
      onRestorePrompt={restoreDefaultPrompt}
    />
  );
}

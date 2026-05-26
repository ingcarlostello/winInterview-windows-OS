import Overlay from "./components/Overlay";
import { useWebSocket } from "./hooks/useWebSocket";

export default function App() {
  const { send, disconnect, connect } = useWebSocket();

  return (
    <Overlay
      onPause={() => send("pause")}
      onResume={() => send("resume")}
      onClear={() => send("clear")}
      onConnect={connect}
      onDisconnect={disconnect}
    />
  );
}

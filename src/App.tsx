import Overlay from "./components/Overlay";
import { useWebSocket } from "./hooks/useWebSocket";

export default function App() {
  const { send } = useWebSocket();

  return (
    <Overlay
      onPause={() => send("pause")}
      onResume={() => send("resume")}
      onClear={() => send("clear")}
    />
  );
}

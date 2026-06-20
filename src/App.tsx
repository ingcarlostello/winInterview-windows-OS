import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import Overlay from "./components/Overlay";
import { useWebSocket } from "./hooks/useWebSocket";
import { useInterviewStore } from "./stores/interview";
import { invoke } from "@tauri-apps/api/core";
import { SignedIn, SignedOut, SignIn, useClerk } from "@clerk/clerk-react";
import AuthGate from "./components/AuthGate";
import EnsureConvexUser from "./components/EnsureConvexUser";
import { usePlanSync } from "./hooks/usePlanSync";
import { usePromptSync } from "./hooks/usePromptSync";
import { useScreenCapture } from "./hooks/useScreenCapture";
import { useTranscriptionCountdown } from "./hooks/useTranscriptionCountdown";
import { usePendingUpgrade } from "./hooks/usePendingUpgrade";

export default function App() {
  const { send, disconnect, connect, setPrompt, restoreDefaultPrompt, changeLanguage } = useWebSocket();
  const { signOut } = useClerk();
  usePlanSync();
  usePromptSync();
  const { captureScreen } = useScreenCapture();
  useTranscriptionCountdown();
  usePendingUpgrade();

  const handleLogout = () => {
    disconnect();
    signOut();
  };

  useEffect(() => {
    const unlistenCapture = listen("capture-screen-shortcut", () => {
      captureScreen();
    });
    return () => {
      unlistenCapture.then((fn) => fn());
    };
  }, [captureScreen]);

  const toggleScreenPanel = async () => {
    const isOpen = !useInterviewStore.getState().screenPanelOpen;
    useInterviewStore.getState().setScreenPanelOpen(isOpen);
    try {
      if (isOpen) {
        await invoke("set_window_expanded", { expanded: true });
      } else {
        setTimeout(async () => {
          try {
            await invoke("set_window_expanded", { expanded: false });
          } catch {
            // best-effort
          }
        }, 500);
      }
    } catch {
      // Window resize is best-effort
    }
  };

  return (
    <AuthGate>
      <SignedIn>
        <EnsureConvexUser />
        <Overlay
          onPause={() => send("pause")}
          onResume={() => send("resume")}
          onConnect={connect}
          onDisconnect={disconnect}
          onSavePrompt={setPrompt}
          onRestorePrompt={restoreDefaultPrompt}
          onChangeLanguage={changeLanguage}
          onToggleScreenPanel={toggleScreenPanel}
          onLogout={handleLogout}
        />
      </SignedIn>
      <SignedOut>
        <div className="flex h-screen w-screen items-center justify-center bg-gray-900 text-white" data-tauri-drag-region>
          <div className="rounded-xl bg-gray-800 p-8 shadow-xl">
            <SignIn routing="virtual" />
          </div>
        </div>
      </SignedOut>
    </AuthGate>
  );
}

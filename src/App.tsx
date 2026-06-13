import { useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import Overlay from "./components/Overlay";
import { useWebSocket } from "./hooks/useWebSocket";
import { useInterviewStore } from "./stores/interview";
import { invoke } from "@tauri-apps/api/core";

export default function App() {
  const { send, disconnect, connect, setPrompt, restoreDefaultPrompt, changeLanguage } = useWebSocket();

  const captureScreen = useCallback(async () => {
    const canCapture = useInterviewStore.getState().canCaptureScreen();
    if (!canCapture) return;

    useInterviewStore.getState().setIsCapturingScreen(true);

    // Wait for the browser to actually paint the spinner
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });

    try {
      const img = await invoke<string>("capture_screen");
      useInterviewStore.getState().addScreenImage(img);
    } catch (error) {
      console.error("Error capturing screen:", error);
    } finally {
      useInterviewStore.getState().setIsCapturingScreen(false);
    }
  }, []);

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
    <Overlay
      onPause={() => send("pause")}
      onResume={() => send("resume")}
      onConnect={connect}
      onDisconnect={disconnect}
      onSavePrompt={setPrompt}
      onRestorePrompt={restoreDefaultPrompt}
      onChangeLanguage={changeLanguage}
      onToggleScreenPanel={toggleScreenPanel}
    />
  );
}

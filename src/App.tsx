import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { KeyRound } from "lucide-react";
import Overlay from "./components/Overlay";
import KeyLoginForm from "./components/KeyLoginForm";
import { useWebSocket } from "./hooks/useWebSocket";
import { useInterviewStore } from "./stores/interview";
import { useTranslation } from "./hooks/useTranslation";
import { usePlanSync } from "./hooks/usePlanSync";
import { useScreenCapture } from "./hooks/useScreenCapture";
import { useTranscriptionCountdown } from "./hooks/useTranscriptionCountdown";
import { usePendingUpgrade } from "./hooks/usePendingUpgrade";
import { useUpdater } from "./hooks/useUpdater";

export default function App() {
  const { send, disconnect, connect, setPrompt, restoreDefaultPrompt, changeLanguage } = useWebSocket();
  const { t } = useTranslation();
  const userKey = useInterviewStore((s) => s.userKey);
  const clearUserKey = useInterviewStore((s) => s.clearUserKey);
  useUpdater();
  usePlanSync();
  const { captureScreen } = useScreenCapture();
  useTranscriptionCountdown();
  usePendingUpgrade();

  const handleLogout = () => {
    disconnect();
    clearUserKey();
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

  // Key-only auth: no stored access key → show the login card; the persisted key
  // (localStorage) rehydrates synchronously, so there's no login flash on restart.
  if (!userKey) {
    return (
      <div
        className="flex h-screen w-screen items-center justify-center bg-[#08090c] text-white"
        data-tauri-drag-region
      >
        <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-2xl border border-white/10 bg-[#0f1115] p-8 shadow-2xl">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#a3e635]/10">
              <KeyRound size={24} className="text-[#a3e635]" />
            </div>
            <h1 className="text-lg font-semibold text-white">{t("keyLoginTitle")}</h1>
            <p className="text-xs text-white/50">{t("keyLoginSubtitle")}</p>
          </div>
          <KeyLoginForm />
        </div>
      </div>
    );
  }

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
      onLogout={handleLogout}
    />
  );
}

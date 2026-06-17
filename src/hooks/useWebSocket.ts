import { useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useInterviewStore } from "../stores/interview";
import type { Status } from "../stores/interview";
import type { PlanInfo } from "../stores/slices/planSlice";
import { WS_MESSAGE_TYPE, WS_STATUS } from "../constants/ws";
import { useAuth } from "@clerk/clerk-react";

const WS_BASE = "ws://localhost:8000/ws";

interface WSMessage {
  type: string;
  data: Record<string, string>;
}

export function useWebSocket() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const intentionalCloseRef = useRef(false);
  const prevStatusRef = useRef<Status>("idle");
  const connectRef = useRef<() => void>(() => {});

  const setStatus = useInterviewStore((s) => s.setStatus);
  const setTranscription = useInterviewStore((s) => s.setTranscription);
  const addResponseChunk = useInterviewStore((s) => s.addResponseChunk);
  const clearResponse = useInterviewStore((s) => s.clearResponse);
  const clearAll = useInterviewStore((s) => s.clearAll);
  const setError = useInterviewStore((s) => s.setError);
  const reset = useInterviewStore((s) => s.reset);
  const incrementQuestionsAnswered = useInterviewStore((s) => s.incrementQuestionsAnswered);
  const mergePlanInfo = useInterviewStore((s) => s.mergePlanInfo);
  const updateQuotas = useInterviewStore((s) => s.updateQuotas);
  const setLiveTranscriptionRemaining = useInterviewStore((s) => s.setLiveTranscriptionRemaining);
  const setCountdownActive = useInterviewStore((s) => s.setCountdownActive);
  const setSessionStartTime = useInterviewStore((s) => s.setSessionStartTime);

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close(1000, "user_disconnect");
    }
    wsRef.current = null;
    setSessionStartTime(null);
    reset();
  }, [reset, setSessionStartTime]);

  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return;
    if (!isLoaded || !isSignedIn) return;

    intentionalCloseRef.current = false;

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    setStatus("connected");

    try {
      const token = await getToken();
      const language = useInterviewStore.getState().language;
      const customPrompt = useInterviewStore.getState().getCustomPrompt();
      const planId = useInterviewStore.getState().planInfo?.plan_id ?? "lite";
      const promptParam = customPrompt.trim() ? `&prompt=${encodeURIComponent(customPrompt.trim())}` : "";
      
      const ws = new WebSocket(`${WS_BASE}?lang=${language}&plan=${planId}&token=${token}${promptParam}`);
      wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      setSessionStartTime(Date.now());
    };

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);

        switch (msg.type) {
          case WS_MESSAGE_TYPE.STATUS: {
            const rawStatus = msg.data.status;

            if (rawStatus === WS_STATUS.CLEARED) {
              clearAll();
              break;
            }

            if (rawStatus === WS_STATUS.PROMPT_SAVED || rawStatus === WS_STATUS.PROMPT_CLEARED) {
              break;
            }

            if (rawStatus === WS_STATUS.QUOTA_EXCEEDED) {
              setError("Transcription quota exceeded. Upgrade your plan to continue.");
              setStatus("paused");
              setSessionStartTime(null);
              
              const currentPlanInfo = useInterviewStore.getState().planInfo;
              if (currentPlanInfo) {
                const updatedQuotas = {
                  ...currentPlanInfo.quotas,
                  transcription_seconds: {
                    ...currentPlanInfo.quotas.transcription_seconds,
                    remaining: 0,
                    used: currentPlanInfo.quotas.transcription_seconds.limit,
                  },
                };
                useInterviewStore.getState().setPlanInfo({
                  ...currentPlanInfo,
                  quotas: updatedQuotas,
                });
              }
              break;
            }

            if (rawStatus === WS_STATUS.FEATURE_BLOCKED) {
              break;
            }

            const statusMap: Record<string, Status> = {
              [WS_STATUS.CONNECTED]: "connected",
              [WS_STATUS.LISTENING]: "listening",
              [WS_STATUS.THINKING]: "thinking",
              [WS_STATUS.RESPONDING]: "responding",
              [WS_STATUS.PAUSED]: "paused",
              [WS_STATUS.RECONNECTING]: "reconnecting",
              [WS_STATUS.CAPTURING]: "capturing",
            };
            const status = statusMap[rawStatus] || "idle";

            if (prevStatusRef.current === "responding" && status === "listening") {
              incrementQuestionsAnswered();
            }
            prevStatusRef.current = status;

            setStatus(status);

            if (rawStatus === WS_STATUS.THINKING) {
              clearResponse();
            }
            break;
          }
          case WS_MESSAGE_TYPE.TRANSCRIPTION:
            setTranscription(msg.data.text);
            break;
          case WS_MESSAGE_TYPE.CHUNK:
            addResponseChunk(msg.data.content);
            break;
          case WS_MESSAGE_TYPE.ERROR:
            setError(msg.data.message);
            break;
          case WS_MESSAGE_TYPE.PLAN_INFO: {
            const planInfo = msg.data as unknown as PlanInfo;
            mergePlanInfo(planInfo);
            invoke("update_plan_permissions", {
              shortcutsEnabled: planInfo.features.keyboard_shortcuts,
              invisibleModeEnabled: planInfo.features.invisible_mode,
              ghostModeEnabled: planInfo.features.ghost_mode,
            }).catch((err) => console.error("[WS] Failed to update plan permissions:", err));
            if (!planInfo.features.invisible_mode) {
              const currentProtected = useInterviewStore.getState().contentProtected;
              if (currentProtected) {
                invoke<boolean>("toggle_content_protected")
                  .then((newState) => {
                    useInterviewStore.getState().setContentProtected(newState);
                  })
                  .catch(() => {
                    useInterviewStore.getState().setContentProtected(false);
                  });
              }
            }
            break;
          }
          case WS_MESSAGE_TYPE.QUOTA_UPDATE: {
            const data = msg.data as Record<string, unknown>;
            if (data.quotas) {
              updateQuotas(data.quotas as Record<string, { used: number; limit: number; remaining: number }>);
              const tsQuota = (data.quotas as Record<string, { remaining: number }>).transcription_seconds;
              if (tsQuota) {
                setLiveTranscriptionRemaining(tsQuota.remaining);
              }
            }
            setCountdownActive(Boolean(data.speech_active));
            break;
          }
        }
      } catch (err) {
        console.error("[WS] Error parsing message:", err, event.data);
      }
    };

    ws.onclose = () => {
      setStatus("idle");
      setSessionStartTime(null);
      if (mountedRef.current && !intentionalCloseRef.current) {
        reconnectTimerRef.current = setTimeout(() => {
          if (wsRef.current?.readyState !== WebSocket.OPEN) {
            connectRef.current();
          }
        }, 3000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
    } catch (e) {
      console.error("[WS] Failed to get Clerk token or connect:", e);
    }
  }, [setStatus, setTranscription, addResponseChunk, clearResponse, clearAll, setError, incrementQuestionsAnswered, mergePlanInfo, updateQuotas, setLiveTranscriptionRemaining, setCountdownActive, setSessionStartTime, getToken, isLoaded, isSignedIn]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    mountedRef.current = true;

    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  const send = useCallback((command: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log(`[WS] Sending: ${command}`);
      wsRef.current.send(command);
    } else {
      console.warn(`[WS] Cannot send "${command}" - WebSocket not open (state: ${wsRef.current?.readyState})`);
    }
  }, []);

  const setPrompt = useCallback((prompt: string) => {
    console.log("[WS] setPrompt called with:", prompt.substring(0, 50) + "...");
    const language = useInterviewStore.getState().language;
    useInterviewStore.getState().setCustomPrompt(language, prompt);
  }, []);

  const restoreDefaultPrompt = useCallback(() => {
    console.log("[WS] restoreDefaultPrompt called");
    send("clear_prompt");
    const language = useInterviewStore.getState().language;
    useInterviewStore.getState().clearCustomPrompt(language);
    console.log("[WS] Zustand store cleared for language:", language);
  }, [send]);

  const changeLanguage = useCallback((language: string) => {
    send(`set_language:${language}`);
  }, [send]);

  return { send, disconnect, connect, setPrompt, restoreDefaultPrompt, changeLanguage };
}

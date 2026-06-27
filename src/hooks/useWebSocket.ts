import { useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useInterviewStore } from "../stores/interview";
import type { Status } from "../stores/interview";
import type { PlanInfo } from "../stores/slices/planSlice";
import type { Language } from "../stores/slices/settingsSlice";
import { WS_MESSAGE_TYPE, WS_STATUS } from "../constants/ws";
import { useAppAuth } from "./useAppAuth";

const WS_BASE = "ws://localhost:8000/ws";

// Reconnect policy: bounded exponential backoff instead of hammering every 3s.
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY = 3000;
const MAX_RECONNECT_DELAY = 30000;
// Backend closes with 1008 (policy violation) for missing/invalid token or key.
// Retrying that is pointless — surface the error and stop.
const WS_FATAL_CLOSE_CODE = 1008;

interface WSMessage {
  type: string;
  data: Record<string, string>;
}

export function useWebSocket() {
  const { mode, isAuthed, getAuthParam } = useAppAuth();
  const upsertPrompt = useMutation(api.prompts.upsertMyPrompt);
  const clearPrompt = useMutation(api.prompts.clearMyPrompt);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const errorReceivedRef = useRef(false);
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
  const archiveCurrentQA = useInterviewStore((s) => s.archiveCurrentQA);
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
    if (!isAuthed) return;

    intentionalCloseRef.current = false;
    errorReceivedRef.current = false;

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    setStatus("connected");

    try {
      const authParam = await getAuthParam();
      if (!authParam) {
        console.warn("[WS] No auth credential available; aborting connect");
        setStatus("idle");
        return;
      }
      const language = useInterviewStore.getState().language;
      const planId = useInterviewStore.getState().planInfo?.plan_id ?? "free";

      const ws = new WebSocket(`${WS_BASE}?lang=${language}&plan=${planId}&${authParam}`);
      wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      setSessionStartTime(Date.now());
      reconnectAttemptsRef.current = 0;
      errorReceivedRef.current = false;
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
              archiveCurrentQA();
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
            errorReceivedRef.current = true;
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
            if (planInfo.features.invisible_mode) {
              invoke("set_content_protected", { enabled: true }).catch(() => {});
              useInterviewStore.getState().setContentProtected(true);
            } else {
              invoke("set_content_protected", { enabled: false }).catch(() => {});
              useInterviewStore.getState().setContentProtected(false);
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

    ws.onclose = (event) => {
      setSessionStartTime(null);

      // Cierre intencional (el usuario pulsó "Finalizar") o componente desmontado.
      if (intentionalCloseRef.current || !mountedRef.current) {
        setStatus("idle");
        reconnectAttemptsRef.current = 0;
        return;
      }

      // Cierre fatal de autenticación: token/clave inválidos o ausentes (code 1008).
      // Reintentar no sirve; mostramos el error y paramos el bucle.
      if (event.code === WS_FATAL_CLOSE_CODE) {
        setError(event.reason || "Sesión o clave inválida. Vuelve a iniciar sesión.");
        setStatus("error");
        reconnectAttemptsRef.current = 0;
        return;
      }

      // Agotados los reintentos: surface un error claro en vez de seguir ciclando.
      if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        if (!errorReceivedRef.current) {
          setError("No se pudo conectar al servicio de transcripción. Revisa tu conexión e inténtalo de nuevo.");
        }
        setStatus("error");
        reconnectAttemptsRef.current = 0;
        return;
      }

      // Conserva el estado/mensaje de error que el backend ya envió (p. ej. fallo
      // de Deepgram); en cortes transitorios sin error explícito, vuelve a idle.
      if (!errorReceivedRef.current) {
        setStatus("idle");
      }

      const delay = Math.min(
        BASE_RECONNECT_DELAY * 2 ** reconnectAttemptsRef.current,
        MAX_RECONNECT_DELAY,
      );
      reconnectAttemptsRef.current += 1;
      reconnectTimerRef.current = setTimeout(() => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) {
          connectRef.current();
        }
      }, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
    } catch (e) {
      console.error("[WS] Failed to get Clerk token or connect:", e);
    }
  }, [setStatus, setTranscription, addResponseChunk, clearResponse, clearAll, setError, incrementQuestionsAnswered, archiveCurrentQA, mergePlanInfo, updateQuotas, setLiveTranscriptionRemaining, setCountdownActive, setSessionStartTime, getAuthParam, isAuthed]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

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
    const language = useInterviewStore.getState().language as Language;
    useInterviewStore.getState().setCustomPrompt(language, prompt);
    // Key-mode has no Clerk JWT, so the Convex mutation would fail; the prompt
    // still applies for the live session via the WS command + local store.
    if (mode !== "key") {
      void upsertPrompt({ lang: language, promptText: prompt }).catch((err) =>
        console.error("[WS] Failed to persist prompt to Convex:", err),
      );
    }
    send(`set_prompt:${prompt}`);
  }, [send, upsertPrompt, mode]);

  const restoreDefaultPrompt = useCallback(() => {
    console.log("[WS] restoreDefaultPrompt called");
    send("clear_prompt");
    const language = useInterviewStore.getState().language as Language;
    useInterviewStore.getState().clearCustomPrompt(language);
    if (mode !== "key") {
      void clearPrompt({ lang: language }).catch((err) =>
        console.error("[WS] Failed to clear prompt in Convex:", err),
      );
    }
    console.log("[WS] Zustand store cleared for language:", language);
  }, [send, clearPrompt, mode]);

  const changeLanguage = useCallback((language: string) => {
    send(`set_language:${language}`);
  }, [send]);

  return { send, disconnect, connect, setPrompt, restoreDefaultPrompt, changeLanguage };
}

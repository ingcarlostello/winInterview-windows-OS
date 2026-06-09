import { useEffect, useRef, useCallback } from "react";
import { useInterviewStore } from "../stores/interview";
import type { Status } from "../stores/interview";

const WS_BASE = "ws://localhost:8000/ws";

interface WSMessage {
  type: string;
  data: Record<string, string>;
}

export function useWebSocket() {
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
    reset();
  }, [reset]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return;

    intentionalCloseRef.current = false;

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    setStatus("connected");

    const language = useInterviewStore.getState().language;
    const customPrompt = useInterviewStore.getState().getCustomPrompt();
    const promptParam = customPrompt.trim() ? `&prompt=${encodeURIComponent(customPrompt.trim())}` : "";
    const ws = new WebSocket(`${WS_BASE}?lang=${language}${promptParam}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
    };

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);

        switch (msg.type) {
          case "status": {
            const rawStatus = msg.data.status;

            if (rawStatus === "cleared") {
              clearAll();
              break;
            }

            if (rawStatus === "prompt_saved" || rawStatus === "prompt_cleared") {
              break;
            }

            const statusMap: Record<string, Status> = {
              connected: "connected",
              listening: "listening",
              thinking: "thinking",
              responding: "responding",
              paused: "paused",
              reconnecting: "reconnecting",
            };
            const status = statusMap[rawStatus] || "idle";

            if (prevStatusRef.current === "responding" && status === "listening") {
              incrementQuestionsAnswered();
            }
            prevStatusRef.current = status;

            setStatus(status);

            if (rawStatus === "thinking") {
              clearResponse();
            }
            break;
          }
          case "transcription":
            setTranscription(msg.data.text);
            break;
          case "chunk":
            addResponseChunk(msg.data.content);
            break;
          case "error":
            setError(msg.data.message);
            break;
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      setStatus("idle");
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
  }, [setStatus, setTranscription, addResponseChunk, clearResponse, clearAll, setError, incrementQuestionsAnswered]);

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

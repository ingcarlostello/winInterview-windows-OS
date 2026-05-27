import { useEffect, useRef, useCallback } from "react";
import { useInterviewStore } from "../stores/interview";
import type { Status } from "../stores/interview";

const WS_URL = "ws://localhost:8000/ws";

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

    const ws = new WebSocket(WS_URL);
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

            const statusMap: Record<string, Status> = {
              connected: "connected",
              listening: "listening",
              thinking: "thinking",
              responding: "responding",
              paused: "paused",
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
        reconnectTimerRef.current = setTimeout(connect, 3000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [setStatus, setTranscription, addResponseChunk, clearResponse, clearAll, setError, incrementQuestionsAnswered]);

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
      wsRef.current.send(command);
    }
  }, []);

  return { send, disconnect, connect };
}

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

  const setStatus = useInterviewStore((s) => s.setStatus);
  const setTranscription = useInterviewStore((s) => s.setTranscription);
  const addResponseChunk = useInterviewStore((s) => s.addResponseChunk);
  const clearResponse = useInterviewStore((s) => s.clearResponse);
  const setError = useInterviewStore((s) => s.setError);

  const disconnect = useCallback(() => {
    mountedRef.current = false;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    function connect() {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;

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
              const statusMap: Record<string, Status> = {
                connected: "connected",
                listening: "listening",
                thinking: "thinking",
                responding: "responding",
                paused: "paused",
              };
              const status = statusMap[msg.data.status] || "idle";
              setStatus(status);

              if (msg.data.status === "listening") {
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
        if (mountedRef.current) {
          reconnectTimerRef.current = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    }

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
  }, [setStatus, setTranscription, addResponseChunk, clearResponse, setError]);

  const send = useCallback((command: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(command);
    }
  }, []);

  return { send, disconnect };
}

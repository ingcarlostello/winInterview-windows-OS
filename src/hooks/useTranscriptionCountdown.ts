import { useEffect, useRef } from "react";
import { useInterviewStore } from "../stores/interview";

export function useTranscriptionCountdown() {
  const countdownActive = useInterviewStore((s) => s.countdownActive);
  const status = useInterviewStore((s) => s.status);
  const setLiveTranscriptionRemaining = useInterviewStore((s) => s.setLiveTranscriptionRemaining);
  const setCountdownActive = useInterviewStore((s) => s.setCountdownActive);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (countdownActive) {
      intervalRef.current = setInterval(() => {
        const current = useInterviewStore.getState().liveTranscriptionRemaining;
        if (current !== null && current > 0) {
          setLiveTranscriptionRemaining(current - 1);
        }
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [countdownActive, setLiveTranscriptionRemaining]);

  useEffect(() => {
    if (status !== "listening" && useInterviewStore.getState().countdownActive) {
      setCountdownActive(false);
    }
  }, [status, setCountdownActive]);
}

import { useCallback, useEffect, useRef, useState } from "react";

import { useSettings } from "@/app/settings";
import { MAX_RECORDING_MS } from "@/data/recordings";

import { describeMicError, isStaleDevice } from "./micErrors";
import { AudioRecorder, type FinishedRecording } from "./recorder";

export type RecorderStatus = "idle" | "starting" | "recording" | "stopping" | "error";

const TICK_MS = 250;

export function useRecorder() {
  const deviceId = useSettings((state) => state.inputDeviceId);
  const setInputDevice = useSettings((state) => state.setInputDevice);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const startedAtRef = useRef(0);
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [take, setTake] = useState<FinishedRecording | null>(null);

  useEffect(() => {
    const recorder = new AudioRecorder();
    recorderRef.current = recorder;
    return () => {
      recorder.cancel();
      recorderRef.current = null;
    };
  }, []);

  const stop = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder?.isRecording) return;
    setStatus("stopping");
    const finished = await recorder.stop();
    setTake(finished);
    setStatus("idle");
    if (!finished) setError("A gravação saiu vazia. Confira o microfone e grave de novo.");
  }, []);

  const start = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    setStatus("starting");
    setError(null);
    setTake(null);
    setElapsedMs(0);
    try {
      try {
        await recorder.start(deviceId);
      } catch (startError: unknown) {
        if (!isStaleDevice(startError) || deviceId === null) throw startError;
        setInputDevice(null);
        await recorder.start(null);
      }
      startedAtRef.current = performance.now();
      setStatus("recording");
    } catch (startError: unknown) {
      setError(describeMicError(startError));
      setStatus("error");
    }
  }, [deviceId, setInputDevice]);

  useEffect(() => {
    if (status !== "recording") return;
    const timer = setInterval(() => {
      const elapsed = performance.now() - startedAtRef.current;
      setElapsedMs(elapsed);
      if (elapsed >= MAX_RECORDING_MS) void stop();
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [status, stop]);

  const discard = useCallback(() => setTake(null), []);

  return { status, error, elapsedMs, take, start, stop, discard };
}

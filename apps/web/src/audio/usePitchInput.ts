import type { PitchFrame } from "@fretless/core";
import { useCallback, useEffect, useRef, useState } from "react";

import { useSettings } from "@/app/settings";

import { describeMicError, isStaleDevice } from "./micErrors";
import { PitchInput, PitchInputCancelled, type PitchInputInfo } from "./PitchInput";

export type MicStatus =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "listening"; info: PitchInputInfo }
  | { status: "error"; message: string };

const MAX_PENDING_FRAMES = 256;

export function usePitchInput() {
  const inputRef = useRef<PitchInput | null>(null);
  const pendingRef = useRef<PitchFrame[]>([]);
  const latestRef = useRef<PitchFrame | null>(null);
  const startingRef = useRef<Promise<boolean> | null>(null);
  const [status, setStatus] = useState<MicStatus>({ status: "idle" });
  const [frame, setFrame] = useState<PitchFrame | null>(null);
  const deviceId = useSettings((state) => state.inputDeviceId);
  const inputGain = useSettings((state) => state.inputGain);
  const setInputDevice = useSettings((state) => state.setInputDevice);

  useEffect(() => {
    const input = new PitchInput();
    inputRef.current = input;
    const unsubscribe = input.onFrame((next) => {
      latestRef.current = next;
      const pending = pendingRef.current;
      pending.push(next);
      if (pending.length > MAX_PENDING_FRAMES) pending.splice(0, pending.length - MAX_PENDING_FRAMES);
    });
    let handle = 0;
    let shown: PitchFrame | null = null;
    const publish = () => {
      if (latestRef.current !== shown) {
        shown = latestRef.current;
        setFrame(shown);
      }
      handle = requestAnimationFrame(publish);
    };
    handle = requestAnimationFrame(publish);
    return () => {
      cancelAnimationFrame(handle);
      unsubscribe();
      void input.stop();
      inputRef.current = null;
    };
  }, []);

  useEffect(() => {
    inputRef.current?.setGain(inputGain);
  }, [inputGain]);

  const start = useCallback(async (): Promise<boolean> => {
    if (startingRef.current) return startingRef.current;
    const input = inputRef.current;
    if (!input) return false;
    const attempt = (async () => {
      setStatus({ status: "starting" });
      pendingRef.current = [];
      try {
        let info: PitchInputInfo;
        try {
          info = await input.start(deviceId);
        } catch (error: unknown) {
          if (!isStaleDevice(error) || deviceId === null) throw error;
          setInputDevice(null);
          info = await input.start(null);
        }
        setStatus({ status: "listening", info });
        return true;
      } catch (error: unknown) {
        setStatus(error instanceof PitchInputCancelled ? { status: "idle" } : { status: "error", message: describeMicError(error) });
        return false;
      } finally {
        startingRef.current = null;
      }
    })();
    startingRef.current = attempt;
    return attempt;
  }, [deviceId, setInputDevice]);

  const stop = useCallback(async () => {
    await inputRef.current?.stop();
    pendingRef.current = [];
    latestRef.current = null;
    setStatus({ status: "idle" });
  }, []);

  const takeFrames = useCallback((): PitchFrame[] => {
    const frames = pendingRef.current;
    pendingRef.current = [];
    return frames;
  }, []);

  return { status, frame, start, stop, takeFrames, input: inputRef };
}

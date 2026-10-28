import type { PitchFrame } from "@fretless/core";
import { useCallback, useEffect, useRef, useState } from "react";

import { useSettings } from "@/app/settings";

import { PitchInput, PitchInputCancelled, type PitchInputInfo } from "./PitchInput";

export type MicStatus =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "listening"; info: PitchInputInfo }
  | { status: "error"; message: string };

const MAX_PENDING_FRAMES = 256;

function describeMicError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") return "O navegador bloqueou o microfone. Permita o acesso e tente de novo.";
    if (error.name === "NotFoundError") return "Nenhum microfone encontrado. Conecte um e tente de novo.";
    if (error.name === "NotReadableError") return "Outro programa está usando o microfone. Feche-o e tente de novo.";
    return `Não foi possível abrir o microfone (${error.name}).`;
  }
  return error instanceof Error ? error.message : "Não foi possível abrir o microfone.";
}

function isStaleDevice(error: unknown): boolean {
  return error instanceof DOMException && error.name === "OverconstrainedError";
}

export function usePitchInput() {
  const inputRef = useRef<PitchInput | null>(null);
  const pendingRef = useRef<PitchFrame[]>([]);
  const latestRef = useRef<PitchFrame | null>(null);
  const startingRef = useRef<Promise<boolean> | null>(null);
  const [status, setStatus] = useState<MicStatus>({ status: "idle" });
  const [frame, setFrame] = useState<PitchFrame | null>(null);
  const deviceId = useSettings((state) => state.inputDeviceId);
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

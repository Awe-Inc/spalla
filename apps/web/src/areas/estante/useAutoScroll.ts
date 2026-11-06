import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { advanceProgress, leadInSeconds, nudgeProgress, progressAtScrollTop, scrollTopAt, type ReadingMap, type TimedScrollPlan } from "@/pdf/autoScroll";

export type RollStatus = "parada" | "contando" | "rolando";

const MANUAL_SCROLL_TOLERANCE_PX = 2;
const MAX_FRAME_SECONDS = 1;

interface AutoScrollOptions {
  containerRef: RefObject<HTMLElement | null>;
  markerRef: RefObject<HTMLElement | null>;
  viewHeight: number;
  contentHeight: number;
  plan: TimedScrollPlan;
  reading: ReadingMap;
  onReadingY: (readingY: number, progress: number) => void;
}

export interface AutoScroll {
  status: RollStatus;
  countdown: number;
  toggle: () => void;
  nudge: (measures: number) => void;
  seek: (scrollTop: number) => void;
}

function useScreenAwake(isWanted: boolean): void {
  useEffect(() => {
    if (!isWanted || !("wakeLock" in navigator)) return;
    let isActive = true;
    let sentinel: WakeLockSentinel | null = null;
    const acquire = () => {
      navigator.wakeLock
        .request("screen")
        .then((lock) => {
          if (isActive) sentinel = lock;
          else void lock.release();
        })
        .catch(() => undefined);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") acquire();
    };
    acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      isActive = false;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => undefined);
    };
  }, [isWanted]);
}

export function useAutoScroll({ containerRef, markerRef, viewHeight, contentHeight, plan, reading, onReadingY }: AutoScrollOptions): AutoScroll {
  const [status, setStatus] = useState<RollStatus>("parada");
  const [countdown, setCountdown] = useState(0);
  const progressRef = useRef(0);
  const lastScrollTopRef = useRef(0);
  const latestRef = useRef({ viewHeight, contentHeight, plan, reading, onReadingY });

  const publish = useCallback(
    (element: HTMLElement) => {
      const latest = latestRef.current;
      const readingY = latest.reading.yAt(progressRef.current);
      const marker = markerRef.current;
      if (marker) marker.style.transform = `translateY(${readingY - element.scrollTop}px)`;
      latest.onReadingY(readingY, progressRef.current);
    },
    [markerRef],
  );

  const applyProgress = useCallback(() => {
    const element = containerRef.current;
    if (!element) return;
    const latest = latestRef.current;
    element.scrollTop = scrollTopAt(progressRef.current, latest.viewHeight, latest.contentHeight, latest.reading);
    lastScrollTopRef.current = element.scrollTop;
    publish(element);
  }, [containerRef, publish]);

  useLayoutEffect(() => {
    latestRef.current = { viewHeight, contentHeight, plan, reading, onReadingY };
  }, [viewHeight, contentHeight, plan, reading, onReadingY]);

  useLayoutEffect(() => {
    if (contentHeight > 0 && viewHeight > 0) applyProgress();
  }, [contentHeight, viewHeight, reading, applyProgress]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const onScroll = () => {
      if (Math.abs(element.scrollTop - lastScrollTopRef.current) <= MANUAL_SCROLL_TOLERANCE_PX) return;
      const latest = latestRef.current;
      progressRef.current = progressAtScrollTop(element.scrollTop, latest.viewHeight, latest.contentHeight, latest.reading, progressRef.current);
      lastScrollTopRef.current = element.scrollTop;
      publish(element);
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, [containerRef, publish]);

  useEffect(() => {
    if (status === "parada") return;
    let frame = 0;
    let previous = performance.now();
    let leadIn = status === "contando" ? leadInSeconds(latestRef.current.plan) : 0;
    if (status === "contando") setCountdown(Math.ceil(leadIn));
    const tick = (now: number) => {
      const elapsed = Math.min(MAX_FRAME_SECONDS, (now - previous) / 1000);
      previous = now;
      if (leadIn > 0) {
        leadIn -= elapsed;
        if (leadIn <= 0) {
          setStatus("rolando");
          return;
        }
        setCountdown(Math.ceil(leadIn));
      } else {
        progressRef.current = advanceProgress(progressRef.current, elapsed, latestRef.current.plan);
        applyProgress();
        if (progressRef.current >= 1) {
          setStatus("parada");
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [status, applyProgress]);

  useScreenAwake(status !== "parada");

  const toggle = useCallback(() => {
    setStatus((current) => {
      if (current !== "parada") return "parada";
      return "contando";
    });
    if (progressRef.current >= 1) {
      progressRef.current = 0;
      applyProgress();
    }
  }, [applyProgress]);

  const nudge = useCallback(
    (measures: number) => {
      const { reading, plan } = latestRef.current;
      progressRef.current = reading.nudged?.(progressRef.current, measures) ?? nudgeProgress(progressRef.current, measures, plan);
      applyProgress();
    },
    [applyProgress],
  );

  const seek = useCallback(
    (scrollTop: number) => {
      const latest = latestRef.current;
      progressRef.current = progressAtScrollTop(scrollTop, latest.viewHeight, latest.contentHeight, latest.reading, progressRef.current);
      applyProgress();
    },
    [applyProgress],
  );

  return { status, countdown, toggle, nudge, seek };
}

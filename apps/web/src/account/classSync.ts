import { useEffect } from "react";

import { refreshClassAssignments } from "./classAssignments";
import { useAccount } from "./store";

export const CLASS_SYNC_INTERVAL_MS = 5 * 60 * 1000;
export const CLASS_SYNC_MIN_GAP_MS = 60 * 1000;

export function isClassSyncDue(lastSyncAt: number | null, now: number, minGapMs = CLASS_SYNC_MIN_GAP_MS): boolean {
  return lastSyncAt === null || now - lastSyncAt >= minGapMs;
}

export function useClassSync(): void {
  const token = useAccount((state) => state.token);

  useEffect(() => {
    let lastSyncAt: number | null = null;
    let controller: AbortController | null = null;

    const sync = (force: boolean) => {
      const now = Date.now();
      if (!force && !isClassSyncDue(lastSyncAt, now)) return;
      lastSyncAt = now;
      controller?.abort();
      controller = new AbortController();
      refreshClassAssignments(undefined, controller.signal).catch(() => undefined);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") sync(false);
    };
    const onOnline = () => sync(true);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") sync(false);
    }, CLASS_SYNC_INTERVAL_MS);

    sync(true);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      controller?.abort();
    };
  }, [token]);
}

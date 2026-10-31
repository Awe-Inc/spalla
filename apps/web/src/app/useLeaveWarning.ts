import { useEffect } from "react";

export function useLeaveWarning(isPending: boolean): void {
  useEffect(() => {
    if (!isPending) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isPending]);
}

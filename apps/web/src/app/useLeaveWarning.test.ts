import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useLeaveWarning } from "./useLeaveWarning";

function dispatchUnload(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("useLeaveWarning", () => {
  it("asks before leaving only while something is pending", () => {
    const { rerender, unmount } = renderHook(({ pending }) => useLeaveWarning(pending), { initialProps: { pending: true } });
    expect(dispatchUnload()).toBe(true);
    rerender({ pending: false });
    expect(dispatchUnload()).toBe(false);
    rerender({ pending: true });
    unmount();
    expect(dispatchUnload()).toBe(false);
  });
});

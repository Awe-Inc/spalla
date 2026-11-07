import { describe, expect, it } from "vitest";

import { describeMicError, isStaleDevice } from "./micErrors";

function domError(name: string, message = "detalhe"): DOMException {
  return new DOMException(message, name);
}

describe("describeMicError", () => {
  it("gives a different next step for each known browser refusal", () => {
    const sentences = ["NotAllowedError", "NotFoundError", "NotReadableError"].map((name) => describeMicError(domError(name)));
    expect(new Set(sentences).size).toBe(3);
  });

  it("does not show a known refusal with the browser's raw message", () => {
    expect(describeMicError(domError("NotAllowedError", "Permission denied by system"))).not.toContain("Permission denied");
  });

  it("still says something for unknown failures", () => {
    for (const cause of [domError("AbortError"), new Error("quebrou"), "texto", undefined]) {
      expect(describeMicError(cause).length).toBeGreaterThan(0);
    }
  });
});

describe("isStaleDevice", () => {
  it("recognizes only a device that no longer matches", () => {
    expect(isStaleDevice(domError("OverconstrainedError"))).toBe(true);
    expect(isStaleDevice(domError("NotAllowedError"))).toBe(false);
    expect(isStaleDevice(new Error("OverconstrainedError"))).toBe(false);
  });
});

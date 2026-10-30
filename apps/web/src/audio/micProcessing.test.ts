import { describe, expect, it } from "vitest";

import { activeProcessing, processingWarning } from "./micProcessing";

describe("activeProcessing", () => {
  it("lists only the filters the browser kept on", () => {
    expect(activeProcessing({ echoCancellation: false, noiseSuppression: true, autoGainControl: true })).toEqual(["noiseSuppression", "autoGainControl"]);
  });

  it("treats a missing setting as off", () => {
    expect(activeProcessing({})).toEqual([]);
  });
});

describe("processingWarning", () => {
  it("is silent when nothing is on", () => {
    expect(processingWarning([])).toBeNull();
  });

  it("agrees with a single feminine filter", () => {
    expect(processingWarning(["noiseSuppression"])).toContain("a supressão de ruído ligada no microfone");
  });

  it("joins several filters in Portuguese", () => {
    expect(processingWarning(["echoCancellation", "noiseSuppression", "autoGainControl"])).toContain(
      "o cancelamento de eco, a supressão de ruído e o ganho automático ligados",
    );
  });
});

import { describe, expect, it } from "vitest";

import { CLASS_SYNC_MIN_GAP_MS, isClassSyncDue } from "./classSync";

describe("isClassSyncDue", () => {
  it("sincroniza na primeira vez", () => {
    expect(isClassSyncDue(null, 1000)).toBe(true);
  });

  it("espera o intervalo mínimo entre duas sincronizações", () => {
    expect(isClassSyncDue(1000, 1000 + CLASS_SYNC_MIN_GAP_MS - 1)).toBe(false);
    expect(isClassSyncDue(1000, 1000 + CLASS_SYNC_MIN_GAP_MS)).toBe(true);
  });
});

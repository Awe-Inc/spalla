import { beforeEach, describe, expect, it } from "vitest";

import { sanitizeSettings, useSettings } from "./settings";

const STORAGE_KEY = "fretless-settings";

async function reloadFrom(stored: string) {
  localStorage.setItem(STORAGE_KEY, stored);
  await useSettings.persist.rehydrate();
}

describe("persisted settings", () => {
  beforeEach(() => {
    localStorage.clear();
    useSettings.setState({ headphonesConfirmedAt: null, metronomeBpm: 72 });
  });

  it("keeps the headphones answer across a reload", async () => {
    useSettings.setState({ headphonesConfirmedAt: 1234 });
    const saved = localStorage.getItem(STORAGE_KEY);
    expect(saved).not.toBeNull();
    useSettings.setState({ headphonesConfirmedAt: null });
    await reloadFrom(saved!);
    expect(useSettings.getState().headphonesConfirmedAt).toBe(1234);
  });

  it("falls back to the current value when a stored value is corrupted", async () => {
    await reloadFrom(JSON.stringify({ state: { metronomeBpm: "rápido" }, version: 1 }));
    expect(useSettings.getState().metronomeBpm).toBe(72);
  });

  it("keeps valid values saved before the settings had a version", async () => {
    await reloadFrom(JSON.stringify({ state: { metronomeBpm: 96 }, version: 0 }));
    expect(useSettings.getState().metronomeBpm).toBe(96);
  });

  it("survives broken JSON in storage", async () => {
    await reloadFrom("{não é json");
    expect(useSettings.getState().metronomeBpm).toBe(72);
  });

  it("drops unknown fields and non-objects", () => {
    expect(sanitizeSettings({ metronomeBpm: 96, invented: true })).toEqual({ metronomeBpm: 96 });
    expect(sanitizeSettings(null)).toEqual({});
    expect(sanitizeSettings("texto")).toEqual({});
  });
});

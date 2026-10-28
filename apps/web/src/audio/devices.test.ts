import { describe, expect, it } from "vitest";

import { isStoredDeviceMissing } from "./devices";

const devices = [{ deviceId: "usb-mic" }, { deviceId: "built-in" }];

describe("isStoredDeviceMissing", () => {
  it("flags a stored id that no listed device has anymore", () => {
    expect(isStoredDeviceMissing("old-headset", devices)).toBe(true);
  });

  it("keeps a stored id that is still listed", () => {
    expect(isStoredDeviceMissing("usb-mic", devices)).toBe(false);
  });

  it("never flags the system default", () => {
    expect(isStoredDeviceMissing(null, devices)).toBe(false);
    expect(isStoredDeviceMissing(null, [])).toBe(false);
  });

  it("waits for permission instead of judging an unlabelled list", () => {
    expect(isStoredDeviceMissing("usb-mic", [])).toBe(false);
    expect(isStoredDeviceMissing("usb-mic", [{ deviceId: "" }, { deviceId: "" }])).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { keyToPageDelta } from "./LeitorPage";

function key(name: string, modifiers: Partial<Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey">> = {}) {
  return { key: name, altKey: false, ctrlKey: false, metaKey: false, ...modifiers };
}

describe("keyToPageDelta", () => {
  it("turns pages with the arrows, page keys and space", () => {
    expect(keyToPageDelta(key("ArrowRight"))).toBe(1);
    expect(keyToPageDelta(key("PageDown"))).toBe(1);
    expect(keyToPageDelta(key(" "))).toBe(1);
    expect(keyToPageDelta(key("ArrowLeft"))).toBe(-1);
    expect(keyToPageDelta(key("PageUp"))).toBe(-1);
  });

  it("leaves browser shortcuts with modifiers alone", () => {
    expect(keyToPageDelta(key("ArrowLeft", { altKey: true }))).toBe(0);
    expect(keyToPageDelta(key("ArrowRight", { ctrlKey: true }))).toBe(0);
    expect(keyToPageDelta(key("ArrowRight", { metaKey: true }))).toBe(0);
    expect(keyToPageDelta(key("a"))).toBe(0);
  });
});

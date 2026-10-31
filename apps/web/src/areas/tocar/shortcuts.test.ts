import { describe, expect, it } from "vitest";

import { isTypingTarget, shortcutFor } from "./shortcuts";

const IDLE = { isRunning: false, isFinished: false };
const RUNNING = { isRunning: true, isFinished: false };
const FINISHED = { isRunning: false, isFinished: true };

describe("shortcutFor", () => {
  it("space starts and stops in every state", () => {
    expect(shortcutFor(" ", IDLE)).toBe("toggle");
    expect(shortcutFor(" ", RUNNING)).toBe("toggle");
  });

  it("keeps tempo and listen keys away from a run in progress", () => {
    expect(shortcutFor("ArrowUp", IDLE)).toBe("faster");
    expect(shortcutFor("ArrowLeft", IDLE)).toBe("slower");
    expect(shortcutFor("ArrowUp", RUNNING)).toBeNull();
    expect(shortcutFor("l", RUNNING)).toBeNull();
    expect(shortcutFor("r", RUNNING)).toBeNull();
  });

  it("plays again from the result but listens only before playing", () => {
    expect(shortcutFor("R", FINISHED)).toBe("again");
    expect(shortcutFor("L", IDLE)).toBe("listen");
    expect(shortcutFor("l", FINISHED)).toBeNull();
    expect(shortcutFor("x", IDLE)).toBeNull();
  });
});

describe("isTypingTarget", () => {
  it("leaves keys alone on fields and buttons", () => {
    expect(isTypingTarget(document.createElement("input"))).toBe(true);
    expect(isTypingTarget(document.createElement("button"))).toBe(true);
    expect(isTypingTarget(document.createElement("div"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

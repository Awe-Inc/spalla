export type TocarShortcut = "toggle" | "again" | "listen" | "slower" | "faster";

export interface ShortcutState {
  isRunning: boolean;
  isFinished: boolean;
}

const EDITABLE_TAGS = new Set(["INPUT", "SELECT", "TEXTAREA", "BUTTON", "A"]);

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return EDITABLE_TAGS.has(target.tagName) || target.isContentEditable === true;
}

export function shortcutFor(key: string, state: ShortcutState): TocarShortcut | null {
  if (key === " ") return "toggle";
  if (key === "r" || key === "R") return state.isRunning ? null : "again";
  if (key === "l" || key === "L") return state.isRunning || state.isFinished ? null : "listen";
  if (key === "ArrowDown" || key === "ArrowLeft") return state.isRunning ? null : "slower";
  if (key === "ArrowUp" || key === "ArrowRight") return state.isRunning ? null : "faster";
  return null;
}

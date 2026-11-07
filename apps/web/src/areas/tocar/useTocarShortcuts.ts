import { useEffect, useRef } from "react";

import { isTypingTarget, shortcutFor, type ShortcutState, type TocarShortcut } from "./shortcuts";

export function useTocarShortcuts(state: ShortcutState, onShortcut: (action: TocarShortcut) => void): void {
  const handlerRef = useRef<((event: KeyboardEvent) => void) | null>(null);

  useEffect(() => {
    handlerRef.current = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
      const action = shortcutFor(event.key, state);
      if (!action) return;
      event.preventDefault();
      onShortcut(action);
    };
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => handlerRef.current?.(event);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TimeLimitError, withinTime } from "./timeLimit";

describe("withinTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("desiste de um trabalho que nunca termina", async () => {
    const reading = withinTime(new Promise<string>(() => undefined), 1000);
    const outcome = expect(reading).rejects.toBeInstanceOf(TimeLimitError);
    await vi.advanceTimersByTimeAsync(1000);
    await outcome;
  });

  it("devolve o resultado de quem termina a tempo", async () => {
    await expect(withinTime(Promise.resolve("lido"), 1000)).resolves.toBe("lido");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("repassa o erro do trabalho", async () => {
    await expect(withinTime(Promise.reject(new Error("falhou")), 1000)).rejects.toThrow("falhou");
  });
});

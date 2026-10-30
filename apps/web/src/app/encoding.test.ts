import { describe, expect, it } from "vitest";

const SOURCES = import.meta.glob<string>(["../**/*.{ts,tsx}", "!../**/*.test.{ts,tsx}"], { query: "?raw", import: "default", eager: true });
const DOUBLE_ENCODED_UTF8 = /[ÂÃ][\u0080-¿]/;

describe("source encoding", () => {
  it("keeps every accent in the interface text readable", () => {
    const broken = Object.entries(SOURCES)
      .filter(([, text]) => DOUBLE_ENCODED_UTF8.test(text))
      .map(([path]) => path);
    expect(broken).toEqual([]);
  });
});

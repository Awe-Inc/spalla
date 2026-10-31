import { describe, expect, it } from "vitest";

import { fromState, offersNextBlock, tocarOrigin } from "./origin";

describe("tocarOrigin", () => {
  it("returns to Hoje when the run was started from the session", () => {
    expect(tocarOrigin(fromState("/"), true)).toEqual({ to: "/", label: "Hoje" });
  });

  it("returns to the exact list it came from, query included", () => {
    expect(tocarOrigin(fromState("/repertorio?nivel=2"), false)).toEqual({ to: "/repertorio?nivel=2", label: "Repertório" });
    expect(tocarOrigin(fromState("/estudar/modulo/warmup"), true)).toEqual({ to: "/estudar/modulo/warmup", label: "Estudar" });
  });

  it("falls back by kind when there is no origin or it is not a known area", () => {
    expect(tocarOrigin(null, true)).toEqual({ to: "/estudar/metodo", label: "Estudar" });
    expect(tocarOrigin(undefined, false)).toEqual({ to: "/repertorio", label: "Repertório" });
    expect(tocarOrigin(fromState("/entrar"), false)).toEqual({ to: "/repertorio", label: "Repertório" });
  });

  it("ignores origins that leave the app", () => {
    expect(tocarOrigin(fromState("//evil.example"), true)).toEqual({ to: "/estudar/metodo", label: "Estudar" });
    expect(tocarOrigin({ from: "https://evil.example" }, false)).toEqual({ to: "/repertorio", label: "Repertório" });
    expect(tocarOrigin({ from: 42 }, false)).toEqual({ to: "/repertorio", label: "Repertório" });
  });
});

describe("offersNextBlock", () => {
  it("offers the next block when the run came from Hoje or from Estudar, and nowhere else", () => {
    expect(offersNextBlock({ to: "/", label: "Hoje" })).toBe(true);
    expect(offersNextBlock({ to: "/estudar/metodo", label: "Estudar" })).toBe(true);
    expect(offersNextBlock({ to: "/repertorio", label: "Repertório" })).toBe(false);
    expect(offersNextBlock({ to: "/estudarx", label: "Estudar" })).toBe(false);
  });
});

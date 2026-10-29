import { describe, expect, it } from "vitest";

import { signupLink } from "@/account/links";

import { actionLabel, inviteState, pageLabel, PERMISSION_GROUPS, togglePermission } from "./admin";

describe("inviteState", () => {
  const base = { revokedAt: null, expiresAt: "2026-11-10T00:00:00Z", uses: 0, maxUses: 1 };
  const now = Date.parse("2026-10-29T12:00:00Z");

  it("reports the reason an invite stopped working, revoked first", () => {
    expect(inviteState(base, now)).toBe("active");
    expect(inviteState({ ...base, uses: 1 }, now)).toBe("used");
    expect(inviteState({ ...base, expiresAt: "2026-10-01T00:00:00Z" }, now)).toBe("expired");
    expect(inviteState({ ...base, uses: 1, revokedAt: "2026-10-20T00:00:00Z" }, now)).toBe("revoked");
  });
});

describe("permissions", () => {
  it("lists every permission exactly once across the groups", () => {
    const all = PERMISSION_GROUPS.flatMap((group) => group.permissions);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(15);
  });

  it("toggles without duplicating", () => {
    expect(togglePermission(["users.read"], "users.read", true)).toEqual(["users.read"]);
    expect(togglePermission(["users.read", "audit.read"], "users.read", false)).toEqual(["audit.read"]);
  });
});

describe("labels", () => {
  it("translates known audit actions and keeps unknown ones readable", () => {
    expect(actionLabel("usuario.suspenso")).toBe("Conta suspensa");
    expect(actionLabel("algo.novo")).toBe("algo.novo");
  });

  it("describes a page of results", () => {
    expect(pageLabel(0, 25, 60)).toBe("1–25 de 60");
    expect(pageLabel(50, 10, 60)).toBe("51–60 de 60");
    expect(pageLabel(0, 0, 0)).toBe("Nenhum resultado");
  });
});

describe("signupLink", () => {
  it("keeps the app base path and encodes the code", () => {
    expect(signupLink({ convite: "AB CD" }, "https://x.dev", "/fretless/")).toBe("https://x.dev/fretless/criar-conta?convite=AB+CD");
    expect(signupLink({ turma: "K7" }, "https://x.dev", "/")).toBe("https://x.dev/criar-conta?turma=K7");
  });
});

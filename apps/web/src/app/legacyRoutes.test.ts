import { describe, expect, it } from "vitest";

import { legacyTarget } from "./legacyRoutes";

describe("legacyTarget", () => {
  it.each([
    ["/praticar", "/estudar"],
    ["/musicas", "/repertorio"],
    ["/musicas/suzuki", "/repertorio/suzuki"],
    ["/musicas/peca/scales.1oct.69", "/repertorio/peca/scales.1oct.69"],
    ["/estante/7", "/repertorio/estante/7"],
    ["/progresso", "/voce"],
    ["/progresso/modulo/warmup", "/estudar/modulo/warmup"],
    ["/configuracoes", "/voce/ajustes"],
    ["/ferramentas/latencia", "/voce/ajustes/atraso"],
    ["/conta", "/voce/conta"],
  ])("sends %s to %s", (from, to) => {
    expect(legacyTarget(from)).toBe(to);
  });

  it("leaves current routes and look-alike prefixes alone", () => {
    expect(legacyTarget("/estudar")).toBeNull();
    expect(legacyTarget("/ferramentas/afinador")).toBeNull();
    expect(legacyTarget("/contato")).toBeNull();
    expect(legacyTarget("/tocar/scales.1oct.69")).toBeNull();
  });
});

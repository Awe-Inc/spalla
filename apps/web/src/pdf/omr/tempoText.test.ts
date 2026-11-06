import { describe, expect, it } from "vitest";

import { tempoFromTexts } from "./tempoText";

describe("andamento escrito", () => {
  it("prefere a marca de metrônomo à palavra", () => {
    expect(tempoFromTexts(["Allegro", "♩ = 92"])).toBe(92);
  });

  it("entende palavra com acento e maiúscula, inteira", () => {
    expect(tempoFromTexts(["ANDANTE cantabile"])).toBe(76);
    expect(tempoFromTexts(["Adágio"])).toBe(66);
  });

  it("não confunde larghetto com largo nem andantino com andante", () => {
    expect(tempoFromTexts(["Larghetto"])).toBe(60);
    expect(tempoFromTexts(["Andantino"])).toBe(84);
  });

  it("ignora número fora da faixa de um metrônomo", () => {
    expect(tempoFromTexts(["x = 999"])).toBeNull();
  });

  it("sem marca nenhuma, não inventa", () => {
    expect(tempoFromTexts(["Sonata", "Op. 3"])).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import { blankSketch, paint, paintStaff } from "./omrFixtures";
import { OCR_SCALE, ocrImageOf, pageTextsFromOcr, type OcrWord } from "./scanWords";

function word(text: string, x0: number, confidence = 90): OcrWord {
  return { text, confidence, bbox: { x0, y0: 100, x1: x0 + 40, y1: 120 } };
}

function page(words: readonly OcrWord[]) {
  return { blocks: [{ paragraphs: [{ lines: [{ words }] }] }] };
}

describe("palavras do OCR", () => {
  it("junta palavras próximas numa frase e volta à escala da página", () => {
    const [text] = pageTextsFromOcr(page([word("D.C.", 100), word("al", 150), word("Fine", 200)]));
    expect(text?.text).toBe("D.C. al Fine");
    expect(text?.x).toBe(100 / OCR_SCALE);
    expect(text?.y).toBe(120 / OCR_SCALE);
    expect(text?.width).toBe(140 / OCR_SCALE);
  });

  it("palavra ilegível quebra a frase para lixo não colar na marca", () => {
    const texts = pageTextsFromOcr(page([word("xq", 40, 20), word("Fine", 100), word("zz", 150, 20), word("Coda", 200)]));
    expect(texts.map((text) => text.text)).toEqual(["Fine", "Coda"]);
  });

  it("palavra longe fica separada", () => {
    expect(pageTextsFromOcr(page([word("Fine", 100), word("Coda", 500)]))).toHaveLength(2);
  });

  it("descarta o que não tem letra", () => {
    expect(pageTextsFromOcr(page([word("123", 100)]))).toEqual([]);
  });

  it("página sem blocos não quebra", () => {
    expect(pageTextsFromOcr({ blocks: null })).toEqual([]);
  });
});

describe("imagem para o OCR", () => {
  it("apaga a pauta e deixa o texto fora dela", () => {
    const sketch = blankSketch(600, 300);
    paintStaff(sketch, 100, 12);
    paint(sketch, 300, 50);
    const image = ocrImageOf(sketch);
    expect(image.width).toBe(600 * OCR_SCALE);
    const grayAt = (x: number, y: number) => image.gray[y * OCR_SCALE * image.width + x * OCR_SCALE];
    expect(grayAt(300, 100)).toBe(255);
    expect(grayAt(300, 124)).toBe(255);
    expect(grayAt(300, 50)).toBe(0);
  });
});

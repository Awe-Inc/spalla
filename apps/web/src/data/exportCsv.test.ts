import type { CurriculumModule, Exercise } from "@fretless/core";
import { describe, expect, it } from "vitest";

import type { ExerciseResult } from "./db";
import { csvField, csvFileName, resultsToCsv } from "./exportCsv";

const exercises = [{ id: "scales.1oct.69", moduleId: "escalas", title: 'Lá maior; "uma oitava"' }] as unknown as Exercise[];
const modules = [{ id: "escalas", title: "Escalas e arpejos" }] as unknown as CurriculumModule[];

function run(playedAt: Date, exerciseId = "scales.1oct.69"): ExerciseResult {
  return { exerciseId, playedAt: playedAt.getTime(), accuracyPct: 87.25, meanSignedCents: -6.04, bpm: 72, stars: 2, durationSeconds: 41.6 };
}

describe("resultsToCsv", () => {
  it("começa com BOM e cabeçalho separado por ponto e vírgula", () => {
    const csv = resultsToCsv([], exercises, modules);
    expect(csv.startsWith("﻿Data;Hora;Módulo;Exercício;Precisão (%);Desvio médio (cents);BPM;Estrelas;Duração (s)\r\n")).toBe(true);
  });

  it("escreve as colunas em ordem, com vírgula decimal e aspas onde precisa", () => {
    const lines = resultsToCsv([run(new Date(2026, 9, 28, 9, 5))], exercises, modules).split("\r\n");
    expect(lines[1]).toBe('2026-10-28;09:05;Escalas e arpejos;"Lá maior; ""uma oitava""";87,3;-6,0;72;2;42');
  });

  it("ordena por data e usa o id quando o exercício não existe mais", () => {
    const lines = resultsToCsv([run(new Date(2026, 9, 28, 10, 0), "sumiu"), run(new Date(2026, 9, 27, 8, 0))], exercises, modules).split("\r\n");
    expect(lines[1]!.startsWith("2026-10-27")).toBe(true);
    expect(lines[2]).toContain(";;sumiu;");
  });
});

describe("csvField", () => {
  it("deixa texto simples como está e protege quebra de linha", () => {
    expect(csvField("Ré")).toBe("Ré");
    expect(csvField("a\nb")).toBe('"a\nb"');
  });
});

describe("csvFileName", () => {
  it("usa a data local", () => {
    expect(csvFileName(new Date(2026, 0, 5, 23, 30))).toBe("spalla-historico-2026-01-05.csv");
  });
});

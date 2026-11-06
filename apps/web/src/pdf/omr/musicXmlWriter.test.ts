// @vitest-environment node
import { loadCore } from "@fretless/core";
import { describe, expect, it } from "vitest";

import { PARSE_OPTIONS } from "@/data/importPiece";

import { musicXmlFromReading, type WrittenPiece } from "./musicXmlWriter";
import { shiftedPitch } from "./noteEdits";
import { readNote, timedMeasure } from "./omrFixtures";
import type { ScoreMeasure } from "./structure";

const PLAIN: ScoreMeasure = { page: 0, system: 0, x0: 0, x1: 1, top: 0, bottom: 1 };
const SCALE = [
  readNote({ midi: [60], positions: [-2] }),
  readNote({ midi: [62], positions: [-1] }),
  readNote({ midi: [64], positions: [0] }),
  readNote({ midi: [65], positions: [1] }),
];

function piece(fields: Partial<WrittenPiece> = {}): WrittenPiece {
  return { title: "Leitura & teste", bpm: 90, measures: [timedMeasure(SCALE), timedMeasure(SCALE)], structure: [PLAIN, PLAIN], ...fields };
}

async function parsed(written: WrittenPiece) {
  const core = await loadCore();
  const result = core.parseMusicXml(new TextEncoder().encode(musicXmlFromReading(written)), PARSE_OPTIONS);
  if (!result.ok) throw new Error(result.error);
  return result.score;
}

function pitchesOf(score: Awaited<ReturnType<typeof parsed>>): number[] {
  return score.events.filter((event) => !event.isRest).map((event) => event.midi);
}

describe("MusicXML da leitura, pelo parser de verdade", () => {
  it("devolve título, andamento e alturas", async () => {
    const score = await parsed(piece());
    expect(score.title).toBe("Leitura & teste");
    expect(Math.round(score.beatsPerMinute)).toBe(90);
    expect(pitchesOf(score)).toEqual([60, 62, 64, 65, 60, 62, 64, 65]);
  });

  it("repetição lida vira repetição tocada", async () => {
    const score = await parsed(piece({ structure: [PLAIN, { ...PLAIN, repeatEnd: true }] }));
    expect(pitchesOf(score)).toHaveLength(16);
  });

  it("correção de meio tom sai como alteração válida", async () => {
    const corrected = shiftedPitch(timedMeasure(SCALE), 2, 1);
    const score = await parsed(piece({ measures: [corrected, timedMeasure(SCALE)] }));
    expect(pitchesOf(score).slice(0, 4)).toEqual([60, 62, 65, 65]);
  });

  it("compasso curto é completado com pausa e não encurta a peça", async () => {
    const whole = await parsed(piece());
    const short = await parsed(piece({ measures: [timedMeasure(SCALE.slice(0, 3), { addsUp: false }), timedMeasure(SCALE)] }));
    expect(pitchesOf(short)).toHaveLength(7);
    expect(short.events.at(-1)?.beat).toBeCloseTo(whole.events.at(-1)?.beat ?? 0);
  });

  it("corda dupla sai como acorde", () => {
    const xml = musicXmlFromReading(piece({ measures: [timedMeasure([readNote({ midi: [69, 76], positions: [5, 9], writtenAlters: [null, null], quarters: 4 })])], structure: [PLAIN] }));
    expect(xml).toContain("<chord/>");
  });

  it("escapa o título", () => {
    expect(musicXmlFromReading(piece())).toContain("Leitura &amp; teste");
  });

  it("nota subida várias vezes na conferência é reescrita com a altura certa, sem alteração absurda", () => {
    const shifted = readNote({ positions: [2], midi: [70], quarters: 4 });
    const xml = musicXmlFromReading(piece({ measures: [timedMeasure([shifted])], structure: [PLAIN] }));
    expect(xml).not.toContain("<alter>3</alter>");
    expect(xml).toContain("<step>B</step><alter>-1</alter><octave>4</octave>");
  });
});

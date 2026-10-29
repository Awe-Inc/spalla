// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { loadCore } from "@fretless/core";
import { describe, expect, it } from "vitest";

import { PARSE_OPTIONS } from "./importPiece";
import { LIBRARY, LIBRARY_FOLDER, libraryFileUrl, type LibraryPiece } from "./library";
import { levelFromNoteCount } from "./pieces";

const VIOLIN_LOWEST_MIDI = 55;
const THIRD_POSITION_TOP_MIDI = 88;
const folder = fileURLToPath(new URL(`${LIBRARY_FOLDER}/`, import.meta.url));

function cleanComposer(composer: string): string {
  return composer.replace(/\s*\(.*\)\s*$/, "").trim();
}

async function manifestFromDisk(): Promise<{ pieces: LibraryPiece[]; ranges: Map<string, [number, number]> }> {
  const core = await loadCore();
  const ranges = new Map<string, [number, number]>();
  const pieces = readdirSync(folder)
    .filter((file) => file.endsWith(".mxl"))
    .sort((a, b) => a.localeCompare(b))
    .map((file) => {
      const parsed = core.parseMusicXml(new Uint8Array(readFileSync(`${folder}${file}`)), PARSE_OPTIONS);
      if (!parsed.ok) throw new Error(`${file}: ${parsed.error}`);
      const { score } = parsed;
      const pitches = score.events.filter((event) => !event.isRest).map((event) => event.midi);
      const slug = file.replace(/\.mxl$/, "").toLowerCase();
      ranges.set(slug, [Math.min(...pitches), Math.max(...pitches)]);
      const beatsPerMinute = Math.round(score.beatsPerMinute);
      return {
        slug,
        file,
        title: score.title.trim() || slug,
        composer: cleanComposer(score.composer) || "Compositor desconhecido",
        noteCount: score.noteCount,
        beatsPerMinute,
        level: levelFromNoteCount(score.noteCount, beatsPerMinute),
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  return { pieces, ranges };
}

describe("biblioteca CC0", () => {
  it("keeps library.json in step with the scores on disk", async () => {
    const { pieces } = await manifestFromDisk();
    await expect(`${JSON.stringify(pieces, null, 2)}\n`).toMatchFileSnapshot("./library.json");
  });

  it("only lists scores a violin can play as written", async () => {
    const { ranges } = await manifestFromDisk();
    for (const [slug, [lowest, highest]] of ranges) {
      expect({ slug, playable: lowest >= VIOLIN_LOWEST_MIDI && highest <= THIRD_POSITION_TOP_MIDI }).toEqual({ slug, playable: true });
    }
  });

  it("gives every piece a unique slug and a bundled file", () => {
    expect(new Set(LIBRARY.map((piece) => piece.slug)).size).toBe(LIBRARY.length);
    for (const piece of LIBRARY) expect(libraryFileUrl(piece), piece.file).not.toBeNull();
  });
});

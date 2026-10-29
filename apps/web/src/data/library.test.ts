import { describe, expect, it } from "vitest";

import { catalogFromLibrary, findLibraryPiece, LIBRARY, LIBRARY_FOLDER, LIBRARY_GENRE, libraryFileUrl, libraryResultId, loadLibraryBytes, type LibraryPiece } from "./library";

const piece: LibraryPiece = {
  slug: "nanny_ernest_chausson",
  file: "1_Nanny_Ernest_Chausson.mxl",
  title: "Nanny",
  composer: "Ernest Chausson",
  noteCount: 117,
  beatsPerMinute: 60,
  level: 3,
};

describe("biblioteca CC0", () => {
  it("lists every piece under its own genre, played from its own route", () => {
    expect(catalogFromLibrary([piece])).toEqual([
      {
        key: "biblioteca:nanny_ernest_chausson",
        resultId: "biblioteca:nanny_ernest_chausson",
        title: "Nanny",
        composer: "Ernest Chausson",
        genre: LIBRARY_GENRE,
        level: 3,
        playTo: "/tocar/biblioteca/nanny_ernest_chausson",
        storedId: null,
      },
    ]);
  });

  it("finds a piece by slug and nothing for an unknown one", () => {
    expect(findLibraryPiece("nanny_ernest_chausson", [piece])).toBe(piece);
    expect(findLibraryPiece("nao-existe", [piece])).toBeNull();
  });

  it("resolves the bundled file url from the folder glob", () => {
    expect(libraryFileUrl(piece, { [`${LIBRARY_FOLDER}/${piece.file}`]: "/assets/nanny.mxl" })).toBe("/assets/nanny.mxl");
    expect(libraryFileUrl(piece, {})).toBeNull();
  });

  it("ships more than a hundred songs", () => {
    expect(LIBRARY.length).toBeGreaterThan(100);
  });

  it("downloads the bytes of a real piece and gives up on a failed request", async () => {
    const first = LIBRARY[0]!;
    const ok = (async () => new Response(new Uint8Array([1, 2, 3]))) as typeof fetch;
    const missing = (async () => new Response(null, { status: 404 })) as typeof fetch;
    const offline = (async () => {
      throw new TypeError("offline");
    }) as typeof fetch;
    expect(await loadLibraryBytes(first.slug, ok)).toEqual(new Uint8Array([1, 2, 3]));
    expect(await loadLibraryBytes(first.slug, missing)).toBeNull();
    expect(await loadLibraryBytes(first.slug, offline)).toBeNull();
    expect(await loadLibraryBytes("nao-existe", ok)).toBeNull();
    expect(libraryResultId(first.slug)).toBe(`biblioteca:${first.slug}`);
  });
});

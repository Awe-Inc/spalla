import manifest from "./library.json";
import { type CatalogPiece } from "./pieces";

export const LIBRARY_GENRE = "Biblioteca CC0";
export const LIBRARY_SOURCE_URL = "https://github.com/OpenScore/Lieder";
export const LIBRARY_FOLDER = "../../../../assets/songs/community";

export interface LibraryPiece {
  slug: string;
  file: string;
  title: string;
  composer: string;
  noteCount: number;
  beatsPerMinute: number;
  level: number;
}

export const LIBRARY: readonly LibraryPiece[] = manifest;

const LIBRARY_FILE_URLS = import.meta.glob<string>("../../../../assets/songs/community/*.mxl", { query: "?url", import: "default", eager: true });

export function libraryFileUrls(): string[] {
  return Object.values(LIBRARY_FILE_URLS);
}

export function libraryResultId(slug: string): string {
  return `biblioteca:${slug}`;
}

export function findLibraryPiece(slug: string, pieces: readonly LibraryPiece[] = LIBRARY): LibraryPiece | null {
  return pieces.find((piece) => piece.slug === slug) ?? null;
}

export function libraryFileUrl(piece: LibraryPiece, urls: Readonly<Record<string, string>> = LIBRARY_FILE_URLS): string | null {
  return urls[`${LIBRARY_FOLDER}/${piece.file}`] ?? null;
}

export function catalogFromLibrary(pieces: readonly LibraryPiece[] = LIBRARY): CatalogPiece[] {
  return pieces.map((piece) => ({
    key: libraryResultId(piece.slug),
    resultId: libraryResultId(piece.slug),
    title: piece.title,
    composer: piece.composer,
    genre: LIBRARY_GENRE,
    level: piece.level,
    playTo: `/tocar/biblioteca/${piece.slug}`,
    storedId: null,
  }));
}

export type LibraryLoad = { status: "ok"; bytes: Uint8Array } | { status: "missing" } | { status: "unreachable" };

const NOT_FOUND = 404;

export async function loadLibraryBytes(slug: string, fetcher: typeof fetch = fetch): Promise<LibraryLoad> {
  const piece = findLibraryPiece(slug);
  const url = piece ? libraryFileUrl(piece) : null;
  if (!url) return { status: "missing" };
  try {
    const response = await fetcher(url);
    if (response.ok) return { status: "ok", bytes: new Uint8Array(await response.arrayBuffer()) };
    return { status: response.status === NOT_FOUND ? "missing" : "unreachable" };
  } catch {
    return { status: "unreachable" };
  }
}

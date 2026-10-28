import type { CurriculumModule } from "@fretless/core";

import type { ExerciseResult, StoredPiece } from "./db";
import { masteryOfExercise } from "./gamification";

export type PieceStatus = "nao-iniciada" | "em-estudo" | "dominada";

export const PIECE_STATUS_LABELS: Record<PieceStatus, string> = {
  "nao-iniciada": "Não iniciada",
  "em-estudo": "Em estudo",
  dominada: "Dominada",
};

export const MASTERED_AT_LEVEL = 3;
export const IMPORTED_GENRE = "Importada";
export const TRADITIONAL_COMPOSER = "Tradicional";

export interface CatalogPiece {
  key: string;
  resultId: string;
  title: string;
  composer: string;
  genre: string;
  level: number;
  playTo: string;
  storedId: number | null;
}

export interface PieceFilters {
  level: number | null;
  composer: string | null;
  genre: string | null;
  status: PieceStatus | null;
}

export const EMPTY_FILTERS: PieceFilters = { level: null, composer: null, genre: null, status: null };

export function catalogFromCurriculum(curriculum: readonly CurriculumModule[]): CatalogPiece[] {
  return curriculum.flatMap((module) =>
    module.exercises
      .filter((exercise) => exercise.kind === "piece" && exercise.playable)
      .map((exercise) => ({
        key: exercise.id,
        resultId: exercise.id,
        title: exercise.title,
        composer: exercise.id.startsWith("repertoire.") ? exercise.subtitle : TRADITIONAL_COMPOSER,
        genre: module.title,
        level: exercise.level,
        playTo: `/tocar/${exercise.id}`,
        storedId: null,
      })),
  );
}

export function catalogFromStored(pieces: readonly StoredPiece[]): CatalogPiece[] {
  return pieces
    .filter((piece) => piece.id !== undefined)
    .map((piece) => ({
      key: `musica:${piece.id}`,
      resultId: `musica:${piece.fileName}`,
      title: piece.title || piece.fileName,
      composer: piece.composer || "Compositor desconhecido",
      genre: piece.genre || IMPORTED_GENRE,
      level: piece.level,
      playTo: `/tocar/musica/${piece.id}`,
      storedId: piece.id ?? null,
    }));
}

export function pieceStatus(results: readonly ExerciseResult[]): PieceStatus {
  if (results.length === 0) return "nao-iniciada";
  const mastered = masteryOfExercise(results) >= MASTERED_AT_LEVEL || results.some((result) => result.stars === 3);
  return mastered ? "dominada" : "em-estudo";
}

export function statusByPiece(pieces: readonly CatalogPiece[], results: readonly ExerciseResult[]): Map<string, PieceStatus> {
  const grouped = new Map<string, ExerciseResult[]>();
  for (const result of results) grouped.set(result.exerciseId, [...(grouped.get(result.exerciseId) ?? []), result]);
  return new Map(pieces.map((piece) => [piece.key, pieceStatus(grouped.get(piece.resultId) ?? [])]));
}

export function filterPieces(pieces: readonly CatalogPiece[], statuses: ReadonlyMap<string, PieceStatus>, filters: PieceFilters): CatalogPiece[] {
  return pieces.filter(
    (piece) =>
      (filters.level === null || piece.level === filters.level) &&
      (filters.composer === null || piece.composer === filters.composer) &&
      (filters.genre === null || piece.genre === filters.genre) &&
      (filters.status === null || statuses.get(piece.key) === filters.status),
  );
}

export function distinctSorted<T extends string | number>(values: readonly T[]): T[] {
  return [...new Set(values)].sort((a, b) => (typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "pt-BR")));
}

export function levelFromNoteCount(noteCount: number, beatsPerMinute: number): number {
  if (noteCount <= 40 && beatsPerMinute <= 80) return 1;
  if (noteCount <= 80 && beatsPerMinute <= 100) return 2;
  if (noteCount <= 160) return 3;
  return 4;
}

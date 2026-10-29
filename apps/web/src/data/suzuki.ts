import type { Exercise } from "@fretless/core";

import { db, localDayKey, type StoredSuzukiPiece } from "./db";

export const SUZUKI_BOOK_PREFIX = "suzuki.book.";
export const SUZUKI_TWINKLE_ID = "suzuki.twinkle.0";
export const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 30] as const;
export const LONGEST_REVIEW_INTERVAL_DAYS = 30;

const DAY_MS = 86_400_000;
const TWINKLE_PIECE = "variacoes do twinkle";

export interface SuzukiPiece {
  key: string;
  name: string;
  exerciseId: string | null;
}

export interface SuzukiBook {
  number: number;
  focus: string;
  howTo: string;
  level: number;
  pieces: SuzukiPiece[];
}

export type SuzukiPieceStatus = "nova" | "em-revisao" | "revisar-hoje";

export function splitBookPieces(source: string): string[] {
  const pieces: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of source) {
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);
    if (char === "," && depth === 0) {
      pieces.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  pieces.push(current);
  return pieces.map((piece) => piece.trim().replace(/\.$/, "")).filter((piece) => piece.length > 0);
}

function normalized(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

function playableIdFor(name: string, playableByTitle: ReadonlyMap<string, string>): string | null {
  const key = normalized(name);
  if (key === TWINKLE_PIECE) return SUZUKI_TWINKLE_ID;
  return playableByTitle.get(key) ?? null;
}

export function suzukiBooks(exercises: readonly Exercise[]): SuzukiBook[] {
  const playableByTitle = new Map(
    exercises.filter((exercise) => exercise.playable).map((exercise) => [normalized(exercise.title), exercise.id] as const),
  );
  return exercises
    .filter((exercise) => exercise.id.startsWith(SUZUKI_BOOK_PREFIX))
    .map((exercise) => {
      const number = Number(exercise.id.slice(SUZUKI_BOOK_PREFIX.length));
      return {
        number,
        focus: exercise.focus,
        howTo: exercise.howTo,
        level: exercise.level,
        pieces: splitBookPieces(exercise.source).map((name) => ({
          key: `${number}:${name}`,
          name,
          exerciseId: playableIdFor(name, playableByTitle),
        })),
      };
    })
    .sort((a, b) => a.number - b.number);
}

export function reviewIntervalDays(reviewCount: number): number {
  const index = Math.min(Math.max(reviewCount, 0), REVIEW_INTERVAL_DAYS.length - 1);
  return REVIEW_INTERVAL_DAYS[index] ?? LONGEST_REVIEW_INTERVAL_DAYS;
}

export function nextReviewDay(piece: StoredSuzukiPiece): string {
  return localDayKey(new Date(piece.lastReviewedAt + reviewIntervalDays(piece.reviewCount) * DAY_MS));
}

export function isReviewDue(piece: StoredSuzukiPiece, today: string): boolean {
  return nextReviewDay(piece) <= today;
}

export function dueReviews(pieces: readonly StoredSuzukiPiece[], today: string): StoredSuzukiPiece[] {
  return pieces.filter((piece) => isReviewDue(piece, today)).sort((a, b) => nextReviewDay(a).localeCompare(nextReviewDay(b)) || a.book - b.book);
}

export function pieceStatus(stored: StoredSuzukiPiece | undefined, today: string): SuzukiPieceStatus {
  if (!stored) return "nova";
  return isReviewDue(stored, today) ? "revisar-hoje" : "em-revisao";
}

export function learnedCount(book: SuzukiBook, learnedKeys: ReadonlySet<string>): number {
  return book.pieces.filter((piece) => learnedKeys.has(piece.key)).length;
}

export function learnedPiece(book: number, name: string, now: number): StoredSuzukiPiece {
  return { key: `${book}:${name}`, book, name, learnedAt: now, lastReviewedAt: now, reviewCount: 0 };
}

export function reviewedPiece(piece: StoredSuzukiPiece, now: number): StoredSuzukiPiece {
  return { ...piece, lastReviewedAt: now, reviewCount: piece.reviewCount + 1 };
}

export async function markLearned(book: number, name: string, now = Date.now()): Promise<void> {
  await db.suzukiPieces.put(learnedPiece(book, name, now));
}

export async function markReviewed(key: string, now = Date.now()): Promise<void> {
  const piece = await db.suzukiPieces.get(key);
  if (piece) await db.suzukiPieces.put(reviewedPiece(piece, now));
}

export async function unmarkLearned(key: string): Promise<void> {
  await db.suzukiPieces.delete(key);
}

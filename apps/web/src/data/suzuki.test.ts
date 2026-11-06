import type { Exercise } from "@fretless/core";
import { describe, expect, it } from "vitest";

import { localDayKey } from "./db";
import {
  dueReviews,
  isReviewDue,
  lapsedPiece,
  learnedCount,
  learnedPiece,
  nextReviewDay,
  pieceStatus,
  reviewedPiece,
  reviewIntervalDays,
  reviewsDoneToday,
  reviewsForToday,
  splitBookPieces,
  SUZUKI_DAILY_REVIEW_CAP,
  suzukiBooks,
  SUZUKI_TWINKLE_ID,
} from "./suzuki";

function exercise(overrides: Partial<Exercise>): Exercise {
  return {
    id: "x",
    moduleId: "suzuki",
    title: "",
    subtitle: "",
    focus: "",
    howTo: "",
    source: "",
    level: 1,
    defaultBpm: 60,
    minBpm: 30,
    maxBpm: 120,
    kind: "reference",
    playable: false,
    droneMidi: 0,
    metronome: false,
    freshEveryTime: false,
    ...overrides,
  } as Exercise;
}

const DAY_MS = 86_400_000;
const start = new Date(2026, 9, 1, 12).getTime();
const dayAfter = (days: number) => localDayKey(new Date(start + days * DAY_MS));

describe("reviews a day can hold", () => {
  const due = (index: number) => learnedPiece(1, `peca ${index}`, start);
  const many = Array.from({ length: SUZUKI_DAILY_REVIEW_CAP + 3 }, (_, index) => due(index));
  const today = dayAfter(1);

  it("shows at most the daily cap, the most overdue first", () => {
    const older = learnedPiece(2, "antiga", start - 10 * DAY_MS);
    const shown = reviewsForToday([...many, older], today);
    expect(shown).toHaveLength(SUZUKI_DAILY_REVIEW_CAP);
    expect(shown[0]?.name).toBe("antiga");
  });

  it("counts what was already reviewed today against the cap", () => {
    const reviewedNow = reviewedPiece(learnedPiece(3, "feita", start), start + DAY_MS);
    expect(reviewsDoneToday([reviewedNow], today)).toBe(1);
    expect(reviewsForToday([...many, reviewedNow], today)).toHaveLength(SUZUKI_DAILY_REVIEW_CAP - 1);
  });

  it("does not count learning a piece as reviewing it", () => {
    expect(reviewsDoneToday([learnedPiece(3, "nova", start)], dayAfter(0))).toBe(0);
  });

  it("brings a forgotten piece back from the first interval", () => {
    const advanced = { ...learnedPiece(1, "esquecida", start), reviewCount: 4 };
    const lapsed = lapsedPiece(advanced, start);
    expect(lapsed.reviewCount).toBe(0);
    expect(nextReviewDay(lapsed)).toBe(dayAfter(1));
  });
});

describe("splitBookPieces", () => {
  it("keeps a concerto whole, with its catalogue number and composer", () => {
    const concerto = "Concerto para violino nº 5 em Lá maior, K. 219, de Mozart";
    expect(splitBookPieces(concerto)).toEqual([concerto]);
  });

  it("still splits pieces whose own title carries a composer", () => {
    expect(splitBookPieces("Sonata em Sol menor de Eccles, Tambourin (Grétry)")).toEqual(["Sonata em Sol menor de Eccles", "Tambourin (Grétry)"]);
  });

  it("keeps commas inside parentheses with their piece", () => {
    expect(splitBookPieces("Canções de ninar (Schubert, Brahms), Concertos 2 e 5 de Seitz")).toEqual([
      "Canções de ninar (Schubert, Brahms)",
      "Concertos 2 e 5 de Seitz",
    ]);
  });
});

describe("suzukiBooks", () => {
  it("orders the books and links the pieces the app can play", () => {
    const books = suzukiBooks([
      exercise({ id: "suzuki.book.2", source: "Musette (Bach)", level: 3 }),
      exercise({ id: "suzuki.book.1", source: "Variações do Twinkle, Lightly Row, Allegro", focus: "Detaché" }),
      exercise({ id: "repertoire.1", title: "Lightly Row", playable: true, kind: "piece" }),
    ]);
    expect(books.map((book) => book.number)).toEqual([1, 2]);
    expect(books[0]?.pieces).toEqual([
      { key: "1:Variações do Twinkle", name: "Variações do Twinkle", exerciseId: SUZUKI_TWINKLE_ID },
      { key: "1:Lightly Row", name: "Lightly Row", exerciseId: "repertoire.1" },
      { key: "1:Allegro", name: "Allegro", exerciseId: null },
    ]);
  });
});

describe("spaced review", () => {
  it("never waits more than thirty days", () => {
    expect([0, 1, 2, 3, 4, 9].map(reviewIntervalDays)).toEqual([1, 3, 7, 14, 30, 30]);
  });

  it("asks for a learned piece the next day and spaces it after each review", () => {
    const learned = learnedPiece(1, "Lightly Row", start);
    expect(isReviewDue(learned, dayAfter(0))).toBe(false);
    expect(isReviewDue(learned, dayAfter(1))).toBe(true);

    const reviewed = reviewedPiece(learned, start + DAY_MS);
    expect(isReviewDue(reviewed, dayAfter(3))).toBe(false);
    expect(isReviewDue(reviewed, dayAfter(4))).toBe(true);
  });

  it("lists the most overdue piece first and reports each status", () => {
    const old = learnedPiece(1, "Allegro", start);
    const recent = learnedPiece(2, "Musette (Bach)", start + 2 * DAY_MS);
    const today = dayAfter(5);
    expect(dueReviews([recent, old], today).map((piece) => piece.key)).toEqual(["1:Allegro", "2:Musette (Bach)"]);
    expect(pieceStatus(undefined, today)).toBe("nova");
    expect(pieceStatus(old, today)).toBe("revisar-hoje");
    expect(pieceStatus(old, dayAfter(0))).toBe("em-revisao");
  });

  it("counts the learned pieces of a book", () => {
    const [book] = suzukiBooks([exercise({ id: "suzuki.book.1", source: "A, B, C" })]);
    expect(book && learnedCount(book, new Set(["1:A", "1:C", "2:A"]))).toBe(2);
  });
});

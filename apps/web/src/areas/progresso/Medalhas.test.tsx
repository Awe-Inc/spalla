import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ExerciseResult, PracticeDay } from "@/data/db";
import { medalProgress, MEDALS } from "@/data/medals";

import { Medalhas } from "./Medalhas";

const results: ExerciseResult[] = Array.from({ length: 12 }, (_, index) => ({ exerciseId: `e${index}`, accuracyPct: 50, stars: 1, playedAt: index, meanSignedCents: 0, bpm: 60, durationSeconds: 60 }));
const days: PracticeDay[] = [{ day: "2026-10-28", minutes: 12, exercisesPlayed: 12 }];

describe("Medalhas", () => {
  it("shows every medal with its tier and the distance to the next one", () => {
    render(<Medalhas medals={medalProgress({ results, days })} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(MEDALS.length);
    expect(screen.getByRole("listitem", { name: "Arco em movimento: Bronze" })).toHaveTextContent("12 de 100 execuções para a prata.");
    expect(screen.getByRole("listitem", { name: "Presença: Ainda sem medalha" })).toHaveTextContent("1 de 7 dias para o bronze.");
    expect(screen.getByText(`1 de ${MEDALS.length * 3} níveis de medalha`)).toBeInTheDocument();
  });
});

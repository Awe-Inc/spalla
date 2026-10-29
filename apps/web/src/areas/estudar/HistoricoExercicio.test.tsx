import type { Exercise } from "@fretless/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ExerciseResult } from "@/data/db";

import { HistoricoExercicio } from "./HistoricoExercicio";

const DAY_MS = 86_400_000;
const now = Date.parse("2026-10-28T12:00:00");

const exercise = { id: "scale-1", kind: "scale", level: 2, playable: true, moduleId: "m", title: "Lá maior", subtitle: "", focus: "", howTo: "", source: "", defaultBpm: 80, minBpm: 40, maxBpm: 120, droneMidi: 0, metronome: false, freshEveryTime: false, recipe: {} } as unknown as Exercise;

function run(accuracyPct: number, daysAgo: number, bpm: number, stars: 0 | 1 | 2 | 3, meanSignedCents = 0): ExerciseResult {
  return { exerciseId: "scale-1", accuracyPct, stars, playedAt: now - daysAgo * DAY_MS, meanSignedCents, bpm, durationSeconds: 60 };
}

describe("HistoricoExercicio", () => {
  it("invites the first play when there is no history", () => {
    render(<HistoricoExercicio exercise={exercise} results={[{ ...run(90, 0, 60, 2), exerciseId: "other" }]} now={now} />);
    expect(screen.getByText(/Ainda não tocado/)).toBeInTheDocument();
  });

  it("summarises count, last play, best result, bars and the sentences", () => {
    render(<HistoricoExercicio exercise={exercise} results={[run(70, 2, 60, 1, -8), run(85, 1, 72, 2, -6), run(96, 0, 80, 3, -4)]} now={now} />);
    expect(screen.getByRole("region", { name: "Histórico de Lá maior" })).toBeInTheDocument();
    expect(screen.getByText("Tocado 3 vezes em 3 dias. Última vez hoje.")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "melhor: 96% a 80 bpm" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Precisão das últimas execuções de Lá maior" }).querySelectorAll("li")).toHaveLength(3);
    expect(screen.getByText("Subiu 26 pontos de precisão nas últimas vezes.")).toBeInTheDocument();
    expect(screen.getByText("Já segura 80% ou mais no andamento escrito (80 bpm).")).toBeInTheDocument();
    expect(screen.getByText("Tendência de 6 cents baixo.")).toBeInTheDocument();
    expect(screen.queryByText(/limpas seguidas/)).toBeNull();
  });
});

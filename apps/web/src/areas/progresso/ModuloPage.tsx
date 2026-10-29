import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Link, useParams } from "react-router";

import { HistoricoExercicio } from "@/areas/praticar/HistoricoExercicio";
import { useCore } from "@/core/useCore";
import { db, type ExerciseResult } from "@/data/db";
import { moduleSummary, type ExerciseSummary } from "@/data/moduleProgress";
import { Card, EmptyState, PageTitle, Stars } from "@/design/components";

const ROW_BUTTON_CLASS = "rounded-sm px-2 py-1 text-caption text-ink-subtle transition-colors duration-fast ease-fretless hover:bg-surface-sunken hover:text-ink";

function lastPlayedSentence(playedAt: number | null): string {
  if (playedAt === null) return "Ainda não tocado";
  return `Última vez em ${new Date(playedAt).toLocaleDateString("pt-BR")}`;
}

function ExerciseLine({ summary, results }: { summary: ExerciseSummary; results: readonly ExerciseResult[] }) {
  const [showHistory, setShowHistory] = useState(false);
  const { exercise } = summary;
  const details = [
    summary.bestAccuracyPct !== null ? `${Math.round(summary.bestAccuracyPct)}% de precisão` : null,
    summary.bestBpm !== null ? `${Math.round(summary.bestBpm)} bpm` : null,
    summary.runs > 0 ? `${summary.runs} ${summary.runs === 1 ? "execução" : "execuções"}` : null,
  ].filter(Boolean);
  return (
    <li className="grid gap-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="grid min-w-0 gap-0.5">
          <span className="font-medium">{exercise.title}</span>
          <span className="text-caption text-ink-subtle">
            {[...details, lastPlayedSentence(summary.lastPlayedAt)].join(" · ")}
          </span>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          {summary.runs > 0 ? (
            <button type="button" className={ROW_BUTTON_CLASS} aria-expanded={showHistory} aria-label={`Histórico de ${exercise.title}`} onClick={() => setShowHistory((value) => !value)}>
              Histórico
            </button>
          ) : null}
          <Link to={`/tocar/${exercise.id}`} className="rounded-sm px-2 py-1 text-caption font-semibold text-primary hover:bg-primary-soft">
            Tocar
          </Link>
          <Stars count={summary.stars} />
        </span>
      </div>
      {showHistory ? <HistoricoExercicio exercise={exercise} results={results} /> : null}
    </li>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <p className="grid gap-0.5">
      <span className="font-mono text-numeric tabular">{value}</span>
      <span className="text-caption text-ink-muted">{label}</span>
    </p>
  );
}

export function ModuloPage() {
  const { moduleId } = useParams();
  const core = useCore();
  const results = useLiveQuery(() => db.results.toArray(), []) ?? [];

  if (core.status !== "ready") {
    return (
      <>
        <PageTitle eyebrow="Progresso" title="Módulo" />
        <p className="text-ink-muted">Carregando o método…</p>
      </>
    );
  }

  const module = core.core.curriculum.find((item) => item.id === moduleId);
  if (!module) {
    return (
      <>
        <PageTitle eyebrow="Progresso" title="Módulo não encontrado" />
        <EmptyState
          title="Esse módulo não existe mais."
          description="Volte ao Progresso e escolha um dos módulos da lista."
          action={
            <Link to="/progresso" className="font-semibold text-primary">
              Ir para Progresso
            </Link>
          }
        />
      </>
    );
  }

  const summary = moduleSummary(module, results);
  const firstExercise = summary.levels[0]?.exercises[0]?.exercise;

  return (
    <>
      <PageTitle eyebrow="Progresso" title={module.title}>
        <Link to="/progresso" className="text-caption font-semibold text-primary">
          Voltar ao Progresso
        </Link>
      </PageTitle>
      <div className="grid gap-6">
        <Card className="grid gap-4 sm:grid-cols-4">
          <Figure value={`${summary.stars}/${summary.maxStars}`} label="estrelas" />
          <Figure value={`${summary.played}/${summary.playable}`} label="exercícios tocados" />
          <Figure value={String(summary.minutes)} label="minutos no módulo" />
          <Figure value={summary.solidLevel !== null ? String(summary.solidLevel) : "—"} label="nível mais alto com 2 estrelas" />
        </Card>
        {summary.played === 0 ? (
          <EmptyState
            title="Nada tocado neste módulo ainda."
            description={module.tagline || "Comece pelo primeiro exercício: o resultado aparece aqui."}
            action={
              firstExercise ? (
                <Link to={`/tocar/${firstExercise.id}`} className="font-semibold text-primary">
                  Tocar {firstExercise.title}
                </Link>
              ) : undefined
            }
          />
        ) : null}
        {summary.levels.map((group) => (
          <Card key={group.level} title={`Nível ${group.level}`}>
            <ul className="divide-y divide-hairline">
              {group.exercises.map((exercise) => (
                <ExerciseLine key={exercise.exercise.id} summary={exercise} results={results} />
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}

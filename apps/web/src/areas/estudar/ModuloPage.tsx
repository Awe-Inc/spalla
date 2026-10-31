import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useLocation, useParams } from "react-router";

import { fromState } from "@/areas/tocar/origin";
import { CoreErrorNotice } from "@/core/CoreErrorNotice";
import { useCore } from "@/core/useCore";
import { db, type ExerciseResult } from "@/data/db";
import { moduleSummary, type ExerciseSummary } from "@/data/moduleProgress";
import { Button, ButtonLink, EmptyState, Stars } from "@/design/components";
import { List, PageHeader, Section, SkeletonList, Stat, Stats } from "@/design/layout";

import { HistoricoExercicio } from "./HistoricoExercicio";

const BACK_TO_METHOD = { to: "/estudar/metodo", label: "Método" };

function lastPlayedSentence(playedAt: number | null): string {
  if (playedAt === null) return "Ainda não tocado";
  return `Última vez em ${new Date(playedAt).toLocaleDateString("pt-BR")}`;
}

function ExerciseLine({ summary, results }: { summary: ExerciseSummary; results: readonly ExerciseResult[] }) {
  const [showHistory, setShowHistory] = useState(false);
  const { pathname } = useLocation();
  const { exercise } = summary;
  const details = [
    summary.bestAccuracyPct !== null ? `${Math.round(summary.bestAccuracyPct)}% de precisão` : null,
    summary.bestBpm !== null ? `${Math.round(summary.bestBpm)} bpm` : null,
    summary.runs > 0 ? `${summary.runs} ${summary.runs === 1 ? "execução" : "execuções"}` : null,
    lastPlayedSentence(summary.lastPlayedAt),
  ].filter(Boolean);
  return (
    <li className="grid gap-3 px-4 py-3 md:px-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <span className="truncate text-body font-semibold text-ink">{exercise.title}</span>
          <span className="text-small text-ink-muted">{details.join(". ")}</span>
        </div>
        <Stars count={summary.stars} />
        <span className="flex shrink-0 items-center gap-1">
          {summary.runs > 0 ? (
            <Button variant="ghost" aria-expanded={showHistory} aria-label={`Histórico de ${exercise.title}`} onClick={() => setShowHistory((value) => !value)}>
              Histórico
            </Button>
          ) : null}
          <ButtonLink to={`/tocar/${exercise.id}`} state={fromState(pathname)} icon="play" aria-label={`Tocar ${exercise.title}`}>
            Tocar
          </ButtonLink>
        </span>
      </div>
      {showHistory ? <HistoricoExercicio exercise={exercise} results={results} /> : null}
    </li>
  );
}

export function ModuloPage() {
  const { moduleId } = useParams();
  const core = useCore();
  const results = useLiveQuery(() => db.results.toArray(), []) ?? [];

  if (core.status !== "ready") {
    return (
      <>
        <PageHeader back={BACK_TO_METHOD} title="Módulo" />
        <SkeletonList rows={4} label="Carregando o método…" />
      </>
    );
  }

  const module = core.core.curriculum.find((item) => item.id === moduleId);
  if (!module) {
    return (
      <>
        <PageHeader back={BACK_TO_METHOD} title="Módulo não encontrado" />
        <EmptyState title="Esse módulo não existe mais." description="Volte ao método e escolha um dos módulos da lista." action={<ButtonLink to="/estudar/metodo">Abrir o método</ButtonLink>} />
      </>
    );
  }

  const summary = moduleSummary(module, results);
  const firstExercise = summary.levels[0]?.exercises[0]?.exercise;

  return (
    <>
      <PageHeader back={BACK_TO_METHOD} title={module.title} description={module.description || module.tagline} />
      <div className="grid gap-10">
        <Stats label={`Resumo de ${module.title}`}>
          <Stat value={`${summary.stars}/${summary.maxStars}`} label="estrelas" tone="primary" />
          <Stat value={`${summary.played}/${summary.playable}`} label="exercícios tocados" />
          <Stat value={summary.minutes} label="minutos no módulo" />
          <Stat value={summary.solidLevel ?? "—"} label="nível mais alto com 2 estrelas" />
        </Stats>
        {summary.played === 0 ? (
          <EmptyState
            title="Nada tocado neste módulo ainda."
            description={module.tagline || "Comece pelo primeiro exercício: o resultado aparece aqui."}
            action={
              firstExercise ? (
                <ButtonLink variant="primary" icon="play" to={`/tocar/${firstExercise.id}`}>
                  Tocar {firstExercise.title}
                </ButtonLink>
              ) : undefined
            }
          />
        ) : null}
        {summary.levels.map((group) => (
          <Section key={group.level} title={`Nível ${group.level}`}>
            <List label={`Exercícios do nível ${group.level}`}>
              {group.exercises.map((exercise) => (
                <ExerciseLine key={exercise.exercise.id} summary={exercise} results={results} />
              ))}
            </List>
          </Section>
        ))}
      </div>
    </>
  );
}

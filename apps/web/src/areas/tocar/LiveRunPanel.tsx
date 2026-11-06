import type { Score } from "@fretless/core";

import { useSettings } from "@/app/settings";
import { StringChip } from "@/design/components";
import { Tuner } from "@/design/Tuner";
import { displayNoteName } from "@/music/noteNames";

import { ComboBar } from "./ComboBar";
import { useLiveValue, type FrameSource, type LiveRun } from "./liveRun";
import { ScoreView } from "./ScoreView";

type LiveSource = FrameSource<LiveRun>;

const START_FRAME = { songTime: 0, currentNoteIndex: 0, judgements: [] };

function NowPlaying({ score, live }: { score: Score; live: LiveSource }) {
  const naming = useSettings((state) => state.noteNaming);
  const isCountdown = useLiveValue(live, (run) => run?.state === "countdown");
  const event = score.events[useLiveValue(live, (run) => run?.currentNoteIndex ?? 0)];
  const cents = useLiveValue(live, (run) => (run && run.liveCents !== null ? Math.round(run.liveCents) : null));
  return (
    <>
      <div className="grid gap-2">
        <span className="text-caption text-ink-subtle">{isCountdown ? "Prepare o arco" : `Compasso ${event?.measure ?? "—"}`}</span>
        <span className="font-display text-note">{event && !event.isRest ? displayNoteName(event.noteName, naming) : "pausa"}</span>
        {event && !event.isRest ? <StringChip index={event.string} /> : null}
      </div>
      <Tuner compact noteLabel={cents === null ? null : displayNoteName(event?.noteName ?? "", naming)} cents={cents} />
    </>
  );
}

function LiveCombo({ live }: { live: LiveSource }) {
  return <ComboBar combo={useLiveValue(live, (run) => run?.stats.combo ?? 0)} />;
}

function LiveStats({ score, live }: { score: Score; live: LiveSource }) {
  const accuracy = useLiveValue(live, (run) => Math.round(run?.stats.accuracyPct ?? 0));
  const judged = useLiveValue(live, (run) => run?.stats.judgedNotes ?? 0);
  const perfect = useLiveValue(live, (run) => run?.stats.perfect ?? 0);
  const miss = useLiveValue(live, (run) => run?.stats.miss ?? 0);
  const unheard = useLiveValue(live, (run) => run?.stats.unheard ?? 0);
  return (
    <>
      <dl className="grid grid-cols-2 gap-4 text-center md:grid-cols-4">
        <div>
          <dt className="text-caption text-ink-subtle">Precisão</dt>
          <dd className="font-mono text-numeric tabular">{accuracy}%</dd>
        </div>
        <div>
          <dt className="text-caption text-ink-subtle">Notas</dt>
          <dd className="font-mono text-numeric tabular">
            {judged}/{score.noteCount}
          </dd>
        </div>
        <div className="hidden md:block">
          <dt className="text-caption text-ink-subtle">Perfeitas</dt>
          <dd className="font-mono text-numeric tabular text-in-tune">{perfect}</dd>
        </div>
        <div className="hidden md:block">
          <dt className="text-caption text-ink-subtle">Erradas</dt>
          <dd className="font-mono text-numeric tabular text-off">{miss}</dd>
        </div>
      </dl>
      {unheard > 0 ? <p className="text-small text-ink-muted">{unheard === 1 ? "1 nota não ouvida pelo microfone" : `${unheard} notas não ouvidas pelo microfone`}</p> : null}
    </>
  );
}

export function LiveClock({ live }: { live: LiveSource }) {
  const clock = useLiveValue(live, (run) => run?.songTime.toFixed(1) ?? null);
  return clock === null ? null : <span className="font-mono tabular">{clock} s</span>;
}

export function LiveRunPanel({ score, live, fromMemory }: { score: Score; live: LiveSource; fromMemory: boolean }) {
  return (
    <section className="grid gap-6" aria-label="Nota atual">
      {fromMemory ? (
        <p className="text-center text-body text-ink-muted">De memória: a pauta fica escondida até o fim da passada.</p>
      ) : (
        <>
          <ScoreView score={score} {...START_FRAME} live={live} />
          <NowPlaying score={score} live={live} />
        </>
      )}
      <LiveCombo live={live} />
      <LiveStats score={score} live={live} />
    </section>
  );
}

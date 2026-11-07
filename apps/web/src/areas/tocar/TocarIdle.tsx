import type { Score } from "@fretless/core";

import type { useListen } from "@/audio/useListen";
import { Button } from "@/design/components";

import { ListenSoundPicker } from "./ListenSoundPicker";
import { ScoreView } from "./ScoreView";
import { LEAD_IN_SECONDS } from "./useSession";

interface TocarIdleProps {
  score: Score;
  howTo: string | null;
  listen: ReturnType<typeof useListen>;
  bpm: number;
  cleanBpm: number | null;
  canStart: boolean;
  isOpeningMic: boolean;
  onBegin: () => void;
}

export function TocarIdle({ score, howTo, listen, bpm, cleanBpm, canStart, isOpeningMic, onBegin }: TocarIdleProps) {
  return (
    <section className="grid justify-items-center gap-4 text-center">
      <ScoreView
        score={score}
        songTime={listen.status === "tocando" ? listen.songTime : -LEAD_IN_SECONDS}
        currentNoteIndex={listen.status === "tocando" ? listen.currentNoteIndex : 0}
        judgements={[]}
      />
      {howTo !== null ? <p className="max-w-prose text-ink-muted">{howTo}</p> : null}
      <p className="text-caption text-ink-subtle">
        {score.noteCount} notas · {bpm} bpm
        {cleanBpm ? ` · último limpo: ${cleanBpm} bpm` : ""}
      </p>
      <p className="hidden text-caption text-ink-subtle lg:block">Espaço começa e para · R toca de novo · L ouve · setas mudam o bpm</p>
      <div className="flex flex-wrap justify-center gap-3">
        <ListenSoundPicker />
        <Button variant="secondary" onClick={() => (listen.status !== "parado" ? listen.stop() : void listen.play())} disabled={listen.status === "carregando"} aria-pressed={listen.status === "tocando"}>
          {listen.status === "carregando" ? "Carregando…" : listen.status === "tocando" ? "Parar" : "Ouvir"}
        </Button>
        <Button variant="primary" onClick={onBegin} disabled={!canStart}>
          {isOpeningMic ? "Abrindo microfone…" : "Começar"}
        </Button>
      </div>
      {!listen.usesSamples ? <p className="text-caption text-ink-subtle">Sem internet para baixar o violino: tocando com um som sintético.</p> : null}
    </section>
  );
}

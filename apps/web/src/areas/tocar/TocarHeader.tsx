import type { MeasureRange } from "@fretless/core";

import { Button, ConfirmButton } from "@/design/components";

interface TocarHeaderProps {
  title: string;
  subtitle: string | null;
  loop: MeasureRange | null;
  bpm: number;
  isRunning: boolean;
  isFinished: boolean;
  hasRun: boolean;
  onStopLoop: () => void;
  onRestart: () => void;
  onStop: () => void;
  onLeave: () => void;
}

export function TocarHeader({ title, subtitle, loop, bpm, isRunning, isFinished, hasRun, onStopLoop, onRestart, onStop, onLeave }: TocarHeaderProps) {
  return (
      <header className="flex items-center justify-between gap-4">
        <div className="grid gap-0.5">
          <p className="sr-only" aria-live="polite">
            {isRunning ? `Passada começou a ${bpm} bpm.` : isFinished ? "Passada terminada." : ""}
          </p>
          <h1 className="text-heading font-semibold">{title}</h1>
          {subtitle !== null ? <p className="text-caption text-ink-subtle">{subtitle}</p> : null}
          {loop ? (
            <p className="text-caption text-primary">
              Repetindo compassos {loop.firstIndex + 1}–{loop.lastIndex + 1}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {loop && hasRun ? <Button onClick={onStopLoop}>Parar repetição</Button> : null}
          {isRunning && !loop ? (
            <>
              <Button icon="voltar" onClick={onRestart}>
                Recomeçar
              </Button>
              <Button onClick={onStop}>Parar</Button>
            </>
          ) : null}
          {isRunning ? (
            <ConfirmButton label="Sair" variant="ghost" question="Descartar esta passada?" confirmLabel="Sair" onConfirm={onLeave} />
          ) : (
            <Button variant="ghost" onClick={onLeave}>
              Sair
            </Button>
          )}
        </div>
      </header>
  );
}

import { useEffect, useId, useRef, useState } from "react";

import { Button, IconButton } from "./actions";
import { InlineError } from "./components";

export interface Removal {
  message: string;
  restore: () => Promise<void>;
}

export function useUndo() {
  const [removal, setRemoval] = useState<Removal | null>(null);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const messageId = useId();

  useEffect(() => {
    if (removal) undoRef.current?.focus();
  }, [removal]);

  function settle() {
    setRemoval(null);
    anchorRef.current?.focus();
  }

  function undo() {
    removal?.restore().then(
      () => {
        setRestoreFailed(false);
        settle();
      },
      () => setRestoreFailed(true),
    );
  }

  function offerUndo(next: Removal) {
    setRestoreFailed(false);
    setRemoval(next);
  }

  const undoNotice = (
    <>
      <span ref={anchorRef} tabIndex={-1} className="sr-only" />
      {removal ? (
        <div role="status" className="flex animate-rise flex-wrap items-center justify-between gap-2 rounded-md bg-surface-soft py-1 pl-4 pr-1 ring-1 ring-inset ring-hairline motion-reduce:animate-none">
          <p id={messageId} className="min-w-0 flex-1 text-small text-ink">
            {removal.message}
          </p>
          <span className="flex items-center gap-1">
            <Button ref={undoRef} variant="quiet" aria-describedby={messageId} onClick={undo}>
              Desfazer
            </Button>
            <IconButton icon="fechar" label="Fechar aviso" onClick={settle} />
          </span>
        </div>
      ) : null}
      {restoreFailed ? <InlineError title="Não deu para trazer de volta." nextStep="Feche e abra o app. Se não voltar, importe ou crie de novo." /> : null}
    </>
  );

  return { offerUndo, undoNotice };
}

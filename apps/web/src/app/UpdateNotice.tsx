import { Button } from "@/design/components";

import { applyAppUpdate, dismissAppUpdate, useAppUpdateAvailable } from "./appUpdate";

export function UpdateNotice() {
  const isAvailable = useAppUpdateAvailable();
  if (!isAvailable) return null;
  return (
    <div role="status" className="mb-6 flex flex-wrap items-center gap-3 rounded-md bg-primary-soft p-4 text-ink">
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Há uma versão nova do Spalla.</span> <span className="text-ink-muted">Atualize quando não estiver no meio de uma passada.</span>
      </p>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={dismissAppUpdate}>
          Depois
        </Button>
        <Button variant="primary" onClick={() => void applyAppUpdate()}>
          Atualizar
        </Button>
      </div>
    </div>
  );
}

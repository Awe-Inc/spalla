import { InlineError } from "@/design/components";

import { useDatabaseFailed } from "./databaseHealth";

export function DatabaseNotice() {
  if (!useDatabaseFailed()) return null;
  return (
    <div className="mb-6">
      <InlineError
        title="Este navegador não deixou o Spalla guardar dados."
        nextStep="Nada do que você tocar fica salvo por enquanto. Se o Spalla estiver aberto em outra aba, feche-a e recarregue; numa janela anônima, abra numa janela normal."
      />
    </div>
  );
}

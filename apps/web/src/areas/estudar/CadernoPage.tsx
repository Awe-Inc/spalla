import { CadernoDaAula } from "./CadernoDaAula";
import { EstudarHeader } from "./EstudarTabs";
import { TarefasDaTurma } from "./TarefasDaTurma";

export function CadernoPage() {
  return (
    <>
      <EstudarHeader />
      <div className="grid gap-6">
        <TarefasDaTurma />
        <CadernoDaAula />
      </div>
    </>
  );
}

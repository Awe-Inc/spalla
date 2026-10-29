import { Link } from "react-router";

import { isPlatformEnabled } from "@/api/client";
import { useAccount } from "@/account/store";
import { Card } from "@/design/components";

export function ContaCard() {
  const user = useAccount((state) => state.user);
  if (!isPlatformEnabled()) return null;
  return (
    <Card title="Sua conta" className="grid gap-2">
      {user ? (
        <>
          <p className="text-ink-muted">
            Conectado como {user.name} ({user.email}). Tarefas do professor e a sincronização da prática ficam na sua conta.
          </p>
          <Link to="/conta" className="font-semibold text-primary">
            Abrir a conta
          </Link>
        </>
      ) : (
        <>
          <p className="text-ink-muted">Entre para receber tarefas do seu professor, entrar em turmas e mostrar sua prática. Sem conta, tudo continua funcionando só neste aparelho.</p>
          <Link to="/entrar" className="font-semibold text-primary">
            Entrar ou criar conta
          </Link>
        </>
      )}
    </Card>
  );
}

import { Button } from "@/design/actions";
import { InlineError } from "@/design/components";

import { retryCore, useCore } from "./useCore";

interface CoreErrorNoticeProps {
  title: string;
}

export function CoreErrorNotice({ title }: CoreErrorNoticeProps) {
  const core = useCore();
  if (core.status !== "error") return null;
  return (
    <InlineError
      title={title}
      nextStep={`${core.message} Confira a conexão e tente de novo. O afinador, o metrônomo e a nota pedal funcionam sem ele.`}
      action={
        <Button variant="secondary" onClick={retryCore}>
          Tentar de novo
        </Button>
      }
    />
  );
}

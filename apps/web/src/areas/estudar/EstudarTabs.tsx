import { PageHeader, Tabs } from "@/design/layout";

const TABS = [
  { to: "/estudar", label: "Rotina", end: true },
  { to: "/estudar/metodo", label: "Método" },
  { to: "/estudar/caderno", label: "Caderno" },
] as const;

export function EstudarHeader() {
  return (
    <>
      <PageHeader title="Estudar" description="Monte a rotina, siga o método e anote o que a aula pediu." />
      <Tabs label="Partes do estudo" items={TABS} />
    </>
  );
}

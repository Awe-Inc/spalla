import { Tabs } from "@/design/layout";

const TABS = [
  { to: "/voce", label: "Progresso", end: true },
  { to: "/voce/ajustes", label: "Ajustes" },
  { to: "/voce/conta", label: "Conta" },
] as const;

export function VoceTabs() {
  return <Tabs label="Partes de Você" items={TABS} />;
}

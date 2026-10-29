import { Tabs } from "@/design/layout";

const TABS = [
  { to: "/repertorio", label: "Catálogo", end: true },
  { to: "/repertorio/suzuki", label: "Suzuki" },
  { to: "/repertorio/estante", label: "Estante" },
] as const;

export function RepertorioTabs() {
  return <Tabs label="Partes do repertório" items={TABS} />;
}

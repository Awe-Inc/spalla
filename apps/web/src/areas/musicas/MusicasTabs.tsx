import { NavLink } from "react-router";

const TABS = [
  { to: "/musicas", label: "Catálogo", end: true },
  { to: "/musicas/estante", label: "Estante", end: false },
  { to: "/musicas/suzuki", label: "Suzuki", end: false },
] as const;

function tabClass({ isActive }: { isActive: boolean }): string {
  const base = "inline-flex h-10 items-center rounded-pill px-4 font-medium transition-colors duration-fast ease-fretless";
  return isActive ? `${base} bg-primary-soft text-primary` : `${base} bg-surface-soft text-ink-muted hover:text-ink`;
}

export function MusicasTabs() {
  return (
    <nav aria-label="Músicas" className="mb-6 flex gap-2">
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.end} className={tabClass}>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}

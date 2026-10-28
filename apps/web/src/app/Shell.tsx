import { useEffect } from "react";
import { Navigate, NavLink, Outlet, useLocation } from "react-router";

import { resolveTheme, useSettings } from "./settings";

interface Area {
  to: string;
  label: string;
  icon: string;
}

export const AREAS: readonly Area[] = [
  { to: "/", label: "Hoje", icon: "M4 12 12 4l8 8M6 10v10h12V10" },
  { to: "/praticar", label: "Praticar", icon: "M6 4v16l13-8z" },
  { to: "/musicas", label: "Músicas", icon: "M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm10-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" },
  { to: "/ferramentas", label: "Ferramentas", icon: "M12 3v18M3 12h18M6 6l12 12M18 6 6 18" },
  { to: "/progresso", label: "Progresso", icon: "M4 20V10m6 10V4m6 16v-7m4 7H2" },
];

function AreaIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={path} />
    </svg>
  );
}

function navClass({ isActive }: { isActive: boolean }): string {
  const base = "flex items-center gap-3 rounded-md px-3 py-2.5 text-body font-medium transition-colors duration-fast ease-fretless";
  return isActive ? `${base} bg-primary-soft text-primary` : `${base} text-ink-muted hover:bg-surface-soft hover:text-ink`;
}

function bottomClass({ isActive }: { isActive: boolean }): string {
  const base = "flex min-w-16 flex-col items-center gap-0.5 rounded-md px-2 py-1.5 text-caption font-medium";
  return isActive ? `${base} text-primary` : `${base} text-ink-muted`;
}

export function useApplyTheme(): void {
  const theme = useSettings((state) => state.theme);
  const accent = useSettings((state) => state.accent);
  useEffect(() => {
    document.documentElement.dataset.accent = accent;
  }, [accent]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(theme, media.matches);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
}

export function Shell() {
  useApplyTheme();
  const location = useLocation();
  const onboardedAt = useSettings((state) => state.onboardedAt);
  const isOnboarding = location.pathname.startsWith("/boas-vindas");
  const isFullscreen = location.pathname.startsWith("/tocar") || isOnboarding;

  if (onboardedAt === null && !isOnboarding) {
    return <Navigate to="/boas-vindas" replace />;
  }

  if (isFullscreen) {
    return <Outlet />;
  }

  const settingsArea = {
    to: "/configuracoes",
    label: "Configurações",
    icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7-3 2-1-1-3-2 .2a7 7 0 0 0-1.5-1.5L16.7 4l-3-1-1 2a7 7 0 0 0-2.1 0l-1-2-3 1 .2 2.3A7 7 0 0 0 5.4 7.8L3 7.6l-1 3 2 1a7 7 0 0 0 0 2.1l-2 1 1 3 2.3-.2a7 7 0 0 0 1.5 1.5L7.3 20l3 1 1-2a7 7 0 0 0 2.1 0l1 2 3-1-.2-2.3a7 7 0 0 0 1.5-1.5l2.3.2 1-3-2-1a7 7 0 0 0 0-2.1z",
  };
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="hidden lg:flex lg:flex-col lg:gap-1 lg:border-r lg:border-hairline lg:px-4 lg:py-6">
        <NavLink to="/" className="mb-6 px-3 font-display text-title text-ink" end>
          Fretless
        </NavLink>
        <nav aria-label="Áreas" className="flex flex-col gap-1">
          {AREAS.map((area) => (
            <NavLink key={area.to} to={area.to} end={area.to === "/"} className={navClass}>
              <AreaIcon path={area.icon} />
              {area.label}
            </NavLink>
          ))}
        </nav>
        <NavLink to={settingsArea.to} className={({ isActive }) => `${navClass({ isActive })} mt-auto`}>
          <AreaIcon path={settingsArea.icon} />
          {settingsArea.label}
        </NavLink>
      </aside>

      <main className="mx-auto w-full max-w-[1120px] px-4 pb-28 pt-6 md:px-6 lg:px-8 lg:pb-12 lg:pt-10">
        <Outlet />
      </main>

      <nav
        aria-label="Áreas"
        className="fixed inset-x-0 bottom-0 flex justify-around border-t border-hairline bg-surface px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 lg:hidden"
      >
        {[...AREAS, settingsArea].map((area) => (
          <NavLink key={area.to} to={area.to} end={area.to === "/"} className={bottomClass}>
            <AreaIcon path={area.icon} />
            {area.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

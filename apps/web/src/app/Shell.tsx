import { useLiveQuery } from "dexie-react-hooks";
import { useEffect } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation, useMatches } from "react-router";

import { isPlatformEnabled } from "@/api/client";
import { isAdminUser, isStudentUser, isTeacherUser, refreshMe, useAccount } from "@/account/store";
import type { Me } from "@/api/types";
import { currentStreak, db, DEFAULT_USER_STATS, localDayKey } from "@/data/db";
import { levelForXp } from "@/data/gamification";
import { Wordmark } from "@/design/brand";
import { Icon, type IconName } from "@/design/icons";

import { resolveTheme, useSettings } from "./settings";

interface Area {
  to: string;
  label: string;
  icon: IconName;
}

export interface RouteHandle {
  fullscreen?: boolean;
}

export const AREAS: readonly Area[] = [
  { to: "/", label: "Hoje", icon: "hoje" },
  { to: "/estudar", label: "Estudar", icon: "estudar" },
  { to: "/repertorio", label: "Repertório", icon: "repertorio" },
  { to: "/ferramentas", label: "Ferramentas", icon: "ferramentas" },
  { to: "/voce", label: "Você", icon: "voce" },
];

export const PLATFORM_AREAS: readonly (Area & { allowed: (user: Me) => boolean })[] = [
  { to: "/aulas", label: "Minhas aulas", icon: "aulas", allowed: isStudentUser },
  { to: "/professor", label: "Professor", icon: "professor", allowed: isTeacherUser },
  { to: "/admin", label: "Administração", icon: "admin", allowed: isAdminUser },
];

const PUBLIC_PATHS = ["/entrar", "/criar-conta", "/termos"];

function usePlatformAreas(): { areas: readonly Area[]; user: Me | null } {
  const user = useAccount((state) => state.user);
  if (!isPlatformEnabled()) return { areas: [], user: null };
  const areas = user ? PLATFORM_AREAS.filter((area) => area.allowed(user)) : [];
  return { areas, user };
}

function useRefreshAccount(): void {
  useEffect(() => {
    if (!isPlatformEnabled()) return;
    refreshMe().catch(() => undefined);
  }, []);
}

export function useIsFullscreenRoute(): boolean {
  return useMatches().some((match) => (match.handle as RouteHandle | undefined)?.fullscreen === true);
}

function navClass({ isActive }: { isActive: boolean }): string {
  const base = "relative flex min-h-11 items-center gap-3 rounded-md px-3 text-body font-medium transition-colors duration-fast ease-spalla";
  return isActive
    ? `${base} bg-primary-soft text-ink before:absolute before:inset-y-2.5 before:-left-4 before:w-0.5 before:rounded-pill before:bg-primary [&>svg]:text-primary`
    : `${base} text-ink-muted hover:bg-surface-soft hover:text-ink`;
}

function bottomClass({ isActive }: { isActive: boolean }): string {
  const base = "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-md text-caption font-medium transition-colors duration-fast ease-spalla";
  return isActive ? `${base} text-primary` : `${base} text-ink-muted hover:text-ink`;
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
      const resolved = resolveTheme(theme, media.matches);
      document.documentElement.dataset.theme = resolved;
      const canvas = getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim();
      if (canvas) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", canvas);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme, accent]);
}

function StudentCard({ user }: { user: Me | null }) {
  const stats = useLiveQuery(() => db.userStats.get("me"), []) ?? DEFAULT_USER_STATS;
  const days = useLiveQuery(() => db.practiceDays.toArray(), []) ?? [];
  const level = levelForXp(stats.xp).level;
  const streak = currentStreak(days, localDayKey(new Date()), stats.frozenDays);
  const name = user?.name ?? "Você";
  return (
    <Link
      to="/voce"
      className="group flex items-center gap-3 rounded-md bg-surface-soft/70 p-3 ring-1 ring-inset ring-hairline transition-colors duration-fast ease-spalla hover:bg-surface-soft"
    >
      <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft font-display text-heading text-primary">
        {name.charAt(0).toUpperCase()}
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span className="truncate text-small font-semibold text-ink">{name}</span>
        <span className="flex items-center gap-1 text-caption text-ink-muted">
          Nível <span className="font-mono tabular">{level}</span>
          {streak > 0 ? (
            <>
              <span aria-hidden className="text-ink-subtle">/</span>
              <Icon name="chama" className="size-3.5 text-primary" />
              <span className="font-mono tabular">{streak}</span>
              <span className="sr-only">{streak === 1 ? "dia seguido" : "dias seguidos"}</span>
            </>
          ) : null}
        </span>
      </span>
    </Link>
  );
}

function Sidebar({ platformAreas, user }: { platformAreas: readonly Area[]; user: Me | null }) {
  return (
    <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-r lg:border-hairline lg:bg-surface-sunken/40 lg:px-4 lg:pb-4 lg:pt-6">
      <NavLink to="/" end className="mb-8 w-fit rounded-sm px-3" aria-label="Spalla, ir para Hoje">
        <Wordmark />
      </NavLink>
      <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-1">
        <nav aria-label="Áreas" className="flex flex-col gap-1">
          {AREAS.map((area) => (
            <NavLink key={area.to} to={area.to} end={area.to === "/"} className={navClass}>
              <Icon name={area.icon} className="size-5" />
              {area.label}
            </NavLink>
          ))}
        </nav>
        {platformAreas.length > 0 ? (
          <nav aria-labelledby="sidebar-aulas" className="flex flex-col gap-1">
            <h2 id="sidebar-aulas" className="px-3 pb-1 text-caption font-medium text-ink-subtle">
              Aulas
            </h2>
            {platformAreas.map((area) => (
              <NavLink key={area.to} to={area.to} className={navClass}>
                <Icon name={area.icon} className="size-5" />
                {area.label}
              </NavLink>
            ))}
          </nav>
        ) : null}
      </div>
      <div className="mt-4 grid gap-1 border-t border-hairline pt-4">
        <StudentCard user={user} />
        {isPlatformEnabled() && !user ? (
          <NavLink to="/entrar" className={navClass}>
            <Icon name="entrar" className="size-5" />
            Entrar
          </NavLink>
        ) : null}
        <NavLink to="/voce/ajustes" className={navClass}>
          <Icon name="ajustes" className="size-5" />
          Ajustes
        </NavLink>
      </div>
    </aside>
  );
}

function MobileHeader({ user }: { user: Me | null }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-hairline bg-canvas/90 px-4 backdrop-blur-sm lg:hidden">
      <NavLink to="/" end className="rounded-sm" aria-label="Spalla, ir para Hoje">
        <Wordmark size="heading" />
      </NavLink>
      <div className="flex items-center gap-1">
        {isPlatformEnabled() && !user ? (
          <Link to="/entrar" className="inline-flex min-h-11 items-center rounded-md px-3 text-small font-semibold text-primary">
            Entrar
          </Link>
        ) : null}
        <Link to="/voce/ajustes" aria-label="Ajustes" className="flex size-11 items-center justify-center rounded-md text-ink-muted hover:bg-surface-soft hover:text-ink">
          <Icon name="ajustes" className="size-5" />
        </Link>
      </div>
    </header>
  );
}

export function Shell() {
  useApplyTheme();
  useRefreshAccount();
  const location = useLocation();
  const onboardedAt = useSettings((state) => state.onboardedAt);
  const { areas: platformAreas, user } = usePlatformAreas();
  const isFullscreen = useIsFullscreenRoute();
  const isOnboarding = location.pathname.startsWith("/boas-vindas");
  const isPublicPage = PUBLIC_PATHS.some((path) => location.pathname.startsWith(path));

  if (onboardedAt === null && !isOnboarding && !isPublicPage) {
    return <Navigate to="/boas-vindas" replace />;
  }

  if (isFullscreen) {
    return <Outlet />;
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-shell">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:shadow-overlay">
        Pular para o conteúdo
      </a>
      <Sidebar platformAreas={platformAreas} user={user} />
      <MobileHeader user={user} />

      <main id="conteudo" className="mx-auto w-full min-w-0 max-w-page px-4 pb-28 pt-6 md:px-6 lg:px-10 lg:pb-16 lg:pt-10">
        <Outlet />
      </main>

      <nav
        aria-label="Áreas"
        className="fixed inset-x-0 bottom-0 z-20 flex gap-1 border-t border-hairline bg-surface/95 px-2 pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5 backdrop-blur-sm lg:hidden"
      >
        {AREAS.map((area) => (
          <NavLink key={area.to} to={area.to} end={area.to === "/"} className={bottomClass}>
            <Icon name={area.icon} className="size-6" />
            <span className="max-w-full truncate">{area.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

const ICON_PATHS = {
  hoje: "M12 21.5V12M12 12c-3.3 0-5-2.2-5-4.8A4.2 4.2 0 0 1 11.2 3a3.4 3.4 0 0 1 3.4 3.4A2.6 2.6 0 0 1 12 9a1.6 1.6 0 0 1-1.6-1.6M9 15.5h6M9.5 18.5h5",
  estudar: "M5 3.5h14v9.5H5zM8.5 7h7M8.5 10h4.5M12 13v8M8 21h8",
  repertorio: "M6 2.5h8.5l4 4V21.5H6zM14.5 2.5v4h4M9 11h6.5M9 14h6.5M9 17h4",
  ferramentas: "M9 2.5v8.5a3 3 0 0 0 6 0V2.5M12 14v7.5M9.5 21.5h5",
  voce: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  aulas: "M3.5 5.5h17v12h-17zM8 9.5h8M8 13.5h5M9 21h6",
  professor: "M2.5 9 12 4l9.5 5L12 14zM6.5 11.2v5c3.3 2.2 7.7 2.2 11 0v-5M21.5 9v5",
  admin: "M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z",
  ajustes: "M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4",
  entrar: "M14 4h5v16h-5M10 16.5l4.5-4.5L10 7.5M14.5 12H3.5",
  play: "M7.5 4.8v14.4a.6.6 0 0 0 .9.5l11.2-7.2a.6.6 0 0 0 0-1L8.4 4.3a.6.6 0 0 0-.9.5z",
  pausar: "M8 5v14M16 5v14",
  voltar: "M15 18l-6-6 6-6",
  avancar: "M9 18l6-6-6-6",
  mais: "M12 5v14M5 12h14",
  apagar: "M4 7h16M9.5 7V4h5v3M6 7l1 13.5h10L18 7M10 11v6M14 11v6",
  ouvir: "M4 9.5v5h3.5L13 19V5L7.5 9.5zM16.5 9a4.2 4.2 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11",
  gravar: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3",
  trecho: "M17 2.5l3 3-3 3M4 11.5V9a3.5 3.5 0 0 1 3.5-3.5H20M7 21.5l-3-3 3-3M20 12.5V15a3.5 3.5 0 0 1-3.5 3.5H4",
  acoes: "M5.5 12h.01M12 12h.01M18.5 12h.01",
  confirmar: "M5 12.5l4.5 4.5L19 7.5",
  fechar: "M6.5 6.5l11 11M17.5 6.5l-11 11",
  fone: "M4 14v-2a8 8 0 0 1 16 0v2M3 13.5h4V20H4.5A1.5 1.5 0 0 1 3 18.5zM21 13.5h-4V20h2.5a1.5 1.5 0 0 0 1.5-1.5z",
  metronomo: "M8 21h8L13.5 4h-3zM12 15l5.5-9",
  nota: "M9 18V5.5l10-2V16M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM19 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  importar: "M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M4.5 17v3.5h15V17",
  chama: "M12 21.5c3.6 0 6-2.5 6-6 0-4.5-4-6.5-4.5-11-2.5 1.5-4 4-3.5 7-1-.5-1.8-1.5-2-2.5-1.3 1.6-2 3.5-2 5.5 0 4 2.4 7 6 7z",
  buscar: "M10.5 17.5a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM15.5 15.5l5 5",
} as const;

export type IconName = keyof typeof ICON_PATHS;

export const ICON_NAMES = Object.keys(ICON_PATHS) as IconName[];

const DOT_ICONS: ReadonlySet<IconName> = new Set(["acoes"]);

export function Icon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={DOT_ICONS.has(name) ? 3 : 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

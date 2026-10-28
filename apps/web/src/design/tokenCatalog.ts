export interface ColorToken {
  name: string;
  role: string;
  swatchClass: string;
  onDark?: boolean;
}

export interface ColorGroup {
  title: string;
  tokens: readonly ColorToken[];
}

export const COLOR_GROUPS: readonly ColorGroup[] = [
  {
    title: "Superfícies",
    tokens: [
      { name: "canvas", role: "Fundo da tela", swatchClass: "bg-canvas" },
      { name: "surface", role: "Cartão, painel, modal", swatchClass: "bg-surface" },
      { name: "surface-soft", role: "Área secundária dentro do cartão, campo de formulário", swatchClass: "bg-surface-soft" },
      { name: "surface-sunken", role: "Trilho de progresso, fundo da highway", swatchClass: "bg-surface-sunken" },
      { name: "hairline", role: "Divisória e borda de campo", swatchClass: "bg-hairline" },
      { name: "hairline-strong", role: "Borda com mais presença", swatchClass: "bg-hairline-strong" },
    ],
  },
  {
    title: "Texto",
    tokens: [
      { name: "ink", role: "Texto principal", swatchClass: "bg-ink", onDark: true },
      { name: "ink-muted", role: "Texto secundário", swatchClass: "bg-ink-muted", onDark: true },
      { name: "ink-subtle", role: "Metadado e legenda", swatchClass: "bg-ink-subtle", onDark: true },
    ],
  },
  {
    title: "Ação",
    tokens: [
      { name: "primary", role: "Ação principal, item ativo da navegação, progresso do dia", swatchClass: "bg-primary", onDark: true },
      { name: "primary-hover", role: "Ação principal sob o ponteiro", swatchClass: "bg-primary-hover", onDark: true },
      { name: "primary-soft", role: "Destaque suave: item atual da rotina, dica", swatchClass: "bg-primary-soft" },
      { name: "on-primary", role: "Texto sobre a cor principal", swatchClass: "bg-on-primary" },
      { name: "focus", role: "Anel de foco do teclado", swatchClass: "bg-focus", onDark: true },
    ],
  },
  {
    title: "Afinação e informação",
    tokens: [
      { name: "in-tune", role: "Nota afinada", swatchClass: "bg-in-tune", onDark: true },
      { name: "in-tune-soft", role: "Fundo de nota afinada", swatchClass: "bg-in-tune-soft" },
      { name: "close", role: "Nota quase lá", swatchClass: "bg-close", onDark: true },
      { name: "close-soft", role: "Fundo de nota quase lá", swatchClass: "bg-close-soft" },
      { name: "off", role: "Nota fora", swatchClass: "bg-off", onDark: true },
      { name: "off-soft", role: "Fundo de nota fora", swatchClass: "bg-off-soft" },
      { name: "info", role: "Informação neutra, link", swatchClass: "bg-info", onDark: true },
      { name: "info-soft", role: "Fundo de aviso neutro", swatchClass: "bg-info-soft" },
    ],
  },
  {
    title: "Cordas",
    tokens: [
      { name: "string-g", role: "Corda Sol", swatchClass: "bg-string-g", onDark: true },
      { name: "string-d", role: "Corda Ré", swatchClass: "bg-string-d", onDark: true },
      { name: "string-a", role: "Corda Lá", swatchClass: "bg-string-a", onDark: true },
      { name: "string-e", role: "Corda Mi", swatchClass: "bg-string-e", onDark: true },
    ],
  },
  {
    title: "Utilitários",
    tokens: [
      { name: "white", role: "Branco fixo, independe do tema", swatchClass: "bg-white" },
      { name: "transparent", role: "Sem cor", swatchClass: "bg-transparent" },
    ],
  },
];

export interface FontToken {
  name: string;
  family: string;
  role: string;
  className: string;
}

export const FONTS: readonly FontToken[] = [
  { name: "display", family: "Fraunces", role: "Nome da tela, título da peça, saudação", className: "font-display" },
  { name: "sans", family: "Figtree", role: "Toda a interface", className: "font-sans" },
  { name: "mono", family: "JetBrains Mono", role: "Cents, bpm, cronômetro, contadores", className: "font-mono" },
];

export interface TextToken {
  name: string;
  spec: string;
  className: string;
  sample: string;
}

export const TEXT_SCALE: readonly TextToken[] = [
  { name: "display", spec: "40 px · 1,1 · −0,5 px", className: "font-display text-display", sample: "Bom dia, Helena" },
  { name: "title", spec: "28 px · 1,2", className: "font-display text-title", sample: "Praticar" },
  { name: "heading", spec: "20 px · 1,3", className: "text-heading font-semibold", sample: "Escalas e arpejos" },
  { name: "body", spec: "16 px · 1,5", className: "text-body", sample: "Toque a escala de Lá maior em duas oitavas, quatro notas por arcada." },
  { name: "caption", spec: "13 px · 1,4 · 0,2 px", className: "text-caption text-ink-subtle", sample: "Última vez ontem · 80 bpm" },
  { name: "numeric", spec: "32 px · 1", className: "font-mono text-numeric tabular", sample: "+12" },
  { name: "note", spec: "72 px · 1", className: "font-mono text-note tabular", sample: "Lá" },
];

export interface ScaleToken {
  name: string;
  value: string;
  className: string;
}

export const RADII: readonly ScaleToken[] = [
  { name: "sm", value: "8 px", className: "rounded-sm" },
  { name: "md", value: "12 px", className: "rounded-md" },
  { name: "lg", value: "16 px", className: "rounded-lg" },
  { name: "xl", value: "24 px", className: "rounded-xl" },
  { name: "pill", value: "999 px", className: "rounded-pill" },
];

export const SHADOWS: readonly ScaleToken[] = [
  { name: "card", value: "Cartão em repouso", className: "shadow-card" },
  { name: "raised", value: "Cartão levantado, menu", className: "shadow-raised" },
  { name: "overlay", value: "Modal e folha", className: "shadow-overlay" },
];

export const DURATIONS: readonly ScaleToken[] = [
  { name: "fast", value: "120 ms", className: "duration-fast" },
  { name: "normal", value: "200 ms", className: "duration-normal" },
  { name: "slow", value: "320 ms", className: "duration-slow" },
];

export const EASINGS: readonly ScaleToken[] = [{ name: "fretless", value: "cubic-bezier(0.2, 0.8, 0.2, 1)", className: "ease-fretless" }];

export const LAYOUT: readonly ScaleToken[] = [
  { name: "container-page", value: "1120 px", className: "max-w-page" },
  { name: "grid-template-columns-shell", value: "240 px · 1fr", className: "grid-cols-shell" },
];

export interface ThemeOption {
  theme: "light" | "dark";
  accent: "padrao" | "sepia";
  label: string;
}

export const THEME_OPTIONS: readonly ThemeOption[] = [
  { theme: "light", accent: "padrao", label: "Claro" },
  { theme: "dark", accent: "padrao", label: "Escuro" },
  { theme: "light", accent: "sepia", label: "Sépia" },
  { theme: "dark", accent: "sepia", label: "Sépia escuro" },
];

export function colorTokenNames(): string[] {
  return COLOR_GROUPS.flatMap((group) => group.tokens.map((token) => token.name));
}

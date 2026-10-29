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
      { name: "focus", role: "Anel de foco do teclado (o mel do tema)", swatchClass: "bg-focus", onDark: true },
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
  { name: "display", family: "Instrument Serif", role: "Nome da tela e saudação; em itálico (font-work), título de obra", className: "font-display" },
  { name: "sans", family: "Instrument Sans", role: "Toda a interface", className: "font-sans" },
  { name: "mono", family: "Geist Mono", role: "Afinador, cents, bpm, cronômetro, contadores", className: "font-mono" },
];

export interface TextToken {
  name: string;
  spec: string;
  className: string;
  sample: string;
}

export const TEXT_SCALE: readonly TextToken[] = [
  { name: "display", spec: "40–56 px, 1, −1 px", className: "font-display text-display", sample: "Boa tarde, Helena" },
  { name: "title", spec: "30–38 px, 1,05, −0,5 px", className: "font-display text-title", sample: "Repertório" },
  { name: "heading", spec: "19 px, 1,3, semibold", className: "text-heading font-semibold", sample: "Escalas e arpejos" },
  { name: "body", spec: "16 px, 1,55", className: "text-body", sample: "Toque a escala de Lá maior em duas oitavas, quatro notas por arcada." },
  { name: "small", spec: "14 px, 1,45", className: "text-small text-ink-muted", sample: "Última vez ontem, a 80 bpm" },
  { name: "caption", spec: "12,5 px, 1,4, +0,1 px", className: "text-caption text-ink-subtle", sample: "3 de 5 limpas" },
  { name: "numeric", spec: "32 px, 1, mono", className: "font-mono text-numeric tabular", sample: "+12" },
  { name: "note", spec: "72 px, 1, mono", className: "font-mono text-note tabular", sample: "Lá" },
];

export interface ScaleToken {
  name: string;
  value: string;
  className: string;
}

export const RADII: readonly ScaleToken[] = [
  { name: "sm", value: "6 px", className: "rounded-sm" },
  { name: "md", value: "10 px", className: "rounded-md" },
  { name: "lg", value: "18 px", className: "rounded-lg" },
  { name: "xl", value: "28 px", className: "rounded-xl" },
  { name: "pill", value: "999 px", className: "rounded-pill" },
];

export const SHADOWS: readonly ScaleToken[] = [
  { name: "card", value: "Cartão em repouso", className: "shadow-card" },
  { name: "raised", value: "Cartão levantado, menu", className: "shadow-raised" },
  { name: "overlay", value: "Modal e folha", className: "shadow-overlay" },
];

export const DURATIONS: readonly ScaleToken[] = [
  { name: "fast", value: "140 ms", className: "duration-fast" },
  { name: "normal", value: "220 ms", className: "duration-normal" },
  { name: "slow", value: "360 ms", className: "duration-slow" },
];

export const EASINGS: readonly ScaleToken[] = [
  { name: "spalla", value: "cubic-bezier(0.2, 0.8, 0.2, 1): toda transição", className: "ease-spalla" },
  { name: "spring", value: "cubic-bezier(0.34, 1.56, 0.64, 1): só confirmação", className: "ease-spring" },
];

export const ANIMATIONS: readonly ScaleToken[] = [
  { name: "rise", value: "Entrada: sobe 6 px e aparece", className: "animate-rise" },
  { name: "pop", value: "Confirmação: estrela, marco", className: "animate-pop" },
];

export const LAYOUT: readonly ScaleToken[] = [
  { name: "container-page", value: "1080 px", className: "max-w-page" },
  { name: "container-prose", value: "68 caracteres", className: "max-w-prose" },
  { name: "grid-template-columns-shell", value: "248 px + 1fr", className: "grid-cols-shell" },
];

export interface ThemeOption {
  theme: "light" | "dark";
  accent: "padrao" | "sepia";
  label: string;
}

export const THEME_OPTIONS: readonly ThemeOption[] = [
  { theme: "dark", accent: "padrao", label: "Abeto escuro" },
  { theme: "light", accent: "padrao", label: "Abeto claro" },
  { theme: "dark", accent: "sepia", label: "Ébano escuro" },
  { theme: "light", accent: "sepia", label: "Ébano claro" },
];

export function colorTokenNames(): string[] {
  return COLOR_GROUPS.flatMap((group) => group.tokens.map((token) => token.name));
}

import type { ReactNode } from "react";

import { Card } from "@/design/components";
import { COLOR_GROUPS, DURATIONS, EASINGS, FONTS, LAYOUT, RADII, SHADOWS, TEXT_SCALE, THEME_OPTIONS, type ColorToken, type ScaleToken } from "@/design/tokenCatalog";

function TokenName({ name }: { name: string }) {
  return <code className="font-mono text-caption text-ink">{name}</code>;
}

function ColorSwatch({ token }: { token: ColorToken }) {
  return (
    <li className="flex items-center gap-3">
      <span className={`size-10 shrink-0 rounded-md border border-hairline ${token.swatchClass}`} aria-hidden />
      <span className="grid gap-0.5">
        <TokenName name={token.name} />
        <span className="text-caption text-ink-muted">{token.role}</span>
      </span>
    </li>
  );
}

export function CoresSection() {
  return (
    <Card title="Cores" className="grid gap-6">
      <p className="max-w-prose text-body text-ink-muted">Cada cor tem um papel, nunca um valor. O componente usa a classe do papel e o tema troca o valor por baixo.</p>
      {COLOR_GROUPS.map((group) => (
        <section key={group.title} className="grid gap-3">
          <h3 className="text-body font-semibold">{group.title}</h3>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={`Cores de ${group.title.toLowerCase()}`}>
            {group.tokens.map((token) => (
              <ColorSwatch key={token.name} token={token} />
            ))}
          </ul>
        </section>
      ))}
    </Card>
  );
}

export function TemasSection() {
  return (
    <Card title="Temas" className="grid gap-4">
      <p className="max-w-prose text-body text-ink-muted">Os mesmos papéis, redefinidos pelo tema e pela paleta. Nenhum componente conhece a paleta.</p>
      <ul className="grid gap-3 sm:grid-cols-2" aria-label="Prévia dos temas">
        {THEME_OPTIONS.map((option) => (
          <li key={option.label} data-theme={option.theme} data-accent={option.accent} className="grid gap-3 rounded-lg border border-hairline bg-canvas p-4 text-ink">
            <div className="flex items-center justify-between gap-2">
              <span className="font-display text-heading">{option.label}</span>
              <span className="rounded-pill bg-primary px-3 py-1 text-caption font-semibold text-on-primary">Começar</span>
            </div>
            <div className="grid gap-2 rounded-md bg-surface p-3 shadow-card">
              <span className="text-body">Escala de Lá maior</span>
              <span className="text-caption text-ink-muted">Duas oitavas · 80 bpm</span>
              <span className="flex gap-1.5" aria-hidden>
                <span className="size-2.5 rounded-pill bg-in-tune" />
                <span className="size-2.5 rounded-pill bg-close" />
                <span className="size-2.5 rounded-pill bg-off" />
                <span className="size-2.5 rounded-pill bg-info" />
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function TipografiaSection() {
  return (
    <Card title="Tipografia" className="grid gap-6">
      <ul className="grid gap-3 sm:grid-cols-3" aria-label="Famílias">
        {FONTS.map((font) => (
          <li key={font.name} className="grid gap-1 rounded-md bg-surface-soft p-4">
            <span className={`${font.className} text-heading`}>{font.family}</span>
            <TokenName name={font.name} />
            <span className="text-caption text-ink-muted">{font.role}</span>
          </li>
        ))}
      </ul>
      <ul className="grid gap-4" aria-label="Escala de texto">
        {TEXT_SCALE.map((size) => (
          <li key={size.name} className="grid items-baseline gap-1 border-t border-hairline pt-4 sm:grid-cols-[10rem_1fr]">
            <span className="grid gap-0.5">
              <TokenName name={size.name} />
              <span className="text-caption text-ink-muted">{size.spec}</span>
            </span>
            <span className={size.className}>{size.sample}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ScaleList({ label, tokens, render }: { label: string; tokens: readonly ScaleToken[]; render: (token: ScaleToken) => ReactNode }) {
  return (
    <ul className="flex flex-wrap gap-4" aria-label={label}>
      {tokens.map((token) => (
        <li key={token.name} className="grid justify-items-center gap-2">
          {render(token)}
          <TokenName name={token.name} />
          <span className="text-caption text-ink-muted">{token.value}</span>
        </li>
      ))}
    </ul>
  );
}

export function FormaSection() {
  return (
    <Card title="Raio, sombra e movimento" className="grid gap-6">
      <ScaleList label="Raios" tokens={RADII} render={(token) => <span className={`size-16 bg-primary-soft ${token.className}`} aria-hidden />} />
      <ScaleList label="Sombras" tokens={SHADOWS} render={(token) => <span className={`size-16 rounded-md bg-surface ${token.className}`} aria-hidden />} />
      <ScaleList
        label="Durações"
        tokens={[...DURATIONS, ...EASINGS]}
        render={(token) => (
          <span className="group grid size-16 place-items-center rounded-md bg-surface-soft" tabIndex={0} aria-label={`Passe o ponteiro para ver ${token.name}`}>
            <span className={`size-6 rounded-pill bg-primary transition-transform ease-fretless group-hover:translate-x-4 group-focus:translate-x-4 ${token.className}`} />
          </span>
        )}
      />
      <ul className="grid gap-2" aria-label="Layout">
        {LAYOUT.map((token) => (
          <li key={token.name} className="flex flex-wrap items-baseline gap-3">
            <TokenName name={token.name} />
            <span className="text-caption text-ink-muted">{token.value}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

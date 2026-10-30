import { useLiveQuery } from "dexie-react-hooks";
import type { ReactNode } from "react";

import { STAFF_SCALES, useSettings, type Accent, type NoteNaming, type StaffScale, type ThemePreference } from "@/app/settings";
import { db, DEFAULT_USER_STATS } from "@/data/db";
import { setDailyGoal } from "@/data/progress";
import { VoceTabs } from "@/areas/voce/VoceTabs";
import { ButtonLink, PageHeader } from "@/design/components";
import { LISTEN_SOUND_OPTIONS } from "@/audio/listenSounds";
import { ChoiceChips } from "@/design/fields";
import { PAGE_STYLE_OPTIONS, READING_GUIDE_OPTIONS, VIEW_OPTIONS } from "@/areas/tocar/viewOptions";

import { DadosCard } from "./DadosCard";
import { MicrofoneCard } from "./MicrofoneCard";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "dark", label: "Escuro" },
  { value: "light", label: "Claro" },
  { value: "system", label: "Igual ao sistema" },
];

const NAMING_OPTIONS: { value: NoteNaming; label: string }[] = [
  { value: "latin", label: "Dó, Ré, Mi" },
  { value: "letters", label: "C, D, E" },
];

const ACCENT_OPTIONS: { value: Accent; label: string }[] = [
  { value: "padrao", label: "Abeto" },
  { value: "sepia", label: "Ébano" },
];

const STAFF_LABELS: Record<StaffScale, string> = { 1: "Normal", 1.25: "Grande", 1.5: "Enorme" };
const GOAL_OPTIONS = [30, 60, 100] as const;

function SettingRow({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,14rem)_1fr] md:items-center md:gap-6">
      <div className="grid gap-0.5">
        <span className="text-body font-semibold text-ink">{title}</span>
        {hint ? <span className="text-small text-ink-muted">{hint}</span> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function SettingGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3">
      <h2 className="text-heading font-semibold">{title}</h2>
      <div className="divide-y divide-hairline rounded-lg bg-surface shadow-card ring-1 ring-hairline/60">{children}</div>
    </section>
  );
}

export function ConfiguracoesPage() {
  const settings = useSettings();
  const stats = useLiveQuery(() => db.userStats.get("me"), []) ?? DEFAULT_USER_STATS;

  return (
    <>
      <PageHeader title="Você" />
      <VoceTabs />
      <div className="grid gap-10 xl:grid-cols-2 xl:items-start">
        <div className="grid min-w-0 gap-10">
          <SettingGroup title="Aparência">
            <SettingRow title="Tema">
              <ChoiceChips name="theme" label="Tema" value={settings.theme} options={THEME_OPTIONS} onChange={settings.setTheme} />
            </SettingRow>
            <SettingRow title="Paleta" hint="Abeto é verde e mel; Ébano é madeira escura.">
              <ChoiceChips name="accent" label="Paleta" value={settings.accent} options={ACCENT_OPTIONS} onChange={settings.setAccent} />
            </SettingRow>
          </SettingGroup>

          <SettingGroup title="Leitura">
            <SettingRow title="Nome das notas">
              <ChoiceChips name="naming" label="Nome das notas" value={settings.noteNaming} options={NAMING_OPTIONS} onChange={settings.setNoteNaming} />
            </SettingRow>
            <SettingRow title="Vista ao tocar" hint="Página é a partitura como no papel: uma linha depois da outra, e a página vira sozinha.">
              <ChoiceChips name="view" label="Vista ao tocar" value={settings.playView} options={VIEW_OPTIONS} onChange={settings.setPlayView} />
            </SettingRow>
            <SettingRow title="Papel" hint="Aparência da partitura em página.">
              <ChoiceChips name="page-style" label="Papel" value={settings.pageStyle} options={PAGE_STYLE_OPTIONS} onChange={settings.setPageStyle} />
            </SettingRow>
            <SettingRow title="Guia de leitura" hint="Sem guia, nada marca onde você está: é o treino de ler de verdade.">
              <ChoiceChips name="guide" label="Guia de leitura" value={settings.readingGuide} options={READING_GUIDE_OPTIONS} onChange={settings.setReadingGuide} />
            </SettingRow>
            <SettingRow title="Tamanho da partitura" hint="Vale para a pauta e para a página na tela Tocar.">
              <ChoiceChips name="staff" label="Tamanho da partitura" value={settings.staffScale} options={STAFF_SCALES.map((scale) => ({ value: scale, label: STAFF_LABELS[scale] }))} onChange={settings.setStaffScale} />
            </SettingRow>
          </SettingGroup>

          <SettingGroup title="Prática">
            <SettingRow title="Meta diária" hint="Nota perfeita vale 3 XP, boa vale 1; a sessão completa dá 50.">
              <ChoiceChips name="goal" label="Meta diária" value={stats.dailyGoalXp} options={GOAL_OPTIONS.map((xp) => ({ value: xp, label: `${xp} XP` }))} onChange={(xp) => void setDailyGoal(xp)} />
            </SettingRow>
            <SettingRow title="Som do Ouvir" hint="Violino gravado, ou um som sintético. O puro (senoidal) ajuda a ouvir a afinação.">
              <ChoiceChips name="listen-sound" label="Som do Ouvir" value={settings.listenSound} options={LISTEN_SOUND_OPTIONS} onChange={(listenSound) => settings.setPracticeAudio({ listenSound })} />
            </SettingRow>
            <SettingRow title="Volume do Ouvir" hint="Botão Ouvir na peça e antes de tocar.">
              <input
                type="range"
                aria-label="Volume do Ouvir"
                min={0}
                max={1}
                step={0.05}
                value={settings.listenVolume}
                className="w-full max-w-xs accent-primary"
                onChange={(event) => settings.setPracticeAudio({ listenVolume: Number(event.target.value) })}
              />
            </SettingRow>
          </SettingGroup>
        </div>

        <div className="grid min-w-0 gap-10">
          <section className="grid gap-3">
            <h2 className="text-heading font-semibold">Áudio</h2>
            <MicrofoneCard />
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-surface px-5 py-4 shadow-card ring-1 ring-hairline/60">
              <div className="grid gap-0.5">
                <span className="text-body font-semibold text-ink">Atraso do som</span>
                <span className="text-small text-ink-muted">Quanto o som leva do violino até o app, para o julgamento do ritmo cair no tempo certo.</span>
              </div>
              <ButtonLink to="/voce/ajustes/atraso" variant="secondary">
                Medir atraso
              </ButtonLink>
            </div>
          </section>

          <section className="grid gap-3">
            <h2 className="text-heading font-semibold">Dados</h2>
            <DadosCard />
          </section>
        </div>
      </div>
    </>
  );
}

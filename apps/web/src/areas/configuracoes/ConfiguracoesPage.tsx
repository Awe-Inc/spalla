import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router";

import { STAFF_SCALES, useSettings, type Accent, type NoteNaming, type StaffScale, type ThemePreference } from "@/app/settings";
import { db, DEFAULT_USER_STATS } from "@/data/db";
import { setDailyGoal } from "@/data/progress";
import { Card, PageTitle } from "@/design/components";

import { ContaCard } from "./ContaCard";
import { DadosCard } from "./DadosCard";
import { MicrofoneCard } from "./MicrofoneCard";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "Igual ao sistema" },
  { value: "light", label: "Claro" },
  { value: "dark", label: "Escuro" },
];

const NAMING_OPTIONS: { value: NoteNaming; label: string }[] = [
  { value: "latin", label: "Dó, Ré, Mi" },
  { value: "letters", label: "C, D, E" },
];

const STAFF_LABELS: Record<StaffScale, string> = { 1: "Normal", 1.25: "Grande", 1.5: "Enorme" };
const GOAL_OPTIONS = [30, 60, 100] as const;

function RadioGroup<T extends string | number>({ name, value, options, onChange }: { name: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {options.map((option) => (
        <label
          key={option.value}
          className={`inline-flex h-10 cursor-pointer items-center rounded-pill px-4 font-medium transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus ${
            option.value === value ? "bg-primary-soft text-primary" : "bg-surface-soft text-ink-muted hover:text-ink"
          }`}
        >
          <input type="radio" name={name} value={String(option.value)} checked={option.value === value} onChange={() => onChange(option.value)} className="sr-only" />
          {option.label}
        </label>
      ))}
    </div>
  );
}

export function ConfiguracoesPage() {
  const settings = useSettings();
  const stats = useLiveQuery(() => db.userStats.get("me"), []) ?? DEFAULT_USER_STATS;
  const accentOptions: { value: Accent; label: string }[] = [
    { value: "padrao", label: "Verniz" },
    { value: "sepia", label: "Sépia" },
  ];

  return (
    <>
      <PageTitle title="Configurações" />
      <div className="grid gap-6">
        <ContaCard />
        <Card title="Aparência" className="grid gap-4">
          <RadioGroup name="theme" value={settings.theme} options={THEME_OPTIONS} onChange={settings.setTheme} />
          <div className="grid gap-2">
            <span className="text-caption text-ink-subtle">Paleta</span>
            <RadioGroup name="accent" value={settings.accent} options={accentOptions} onChange={settings.setAccent} />
          </div>
          <p className="text-caption text-ink-subtle">
            Quer ver as cores, as fontes e os componentes do app?{" "}
            <Link to="/componentes" className="font-semibold text-primary">
              Componentes e tokens
            </Link>
            .
          </p>
        </Card>
        <Card title="Nome das notas">
          <RadioGroup name="naming" value={settings.noteNaming} options={NAMING_OPTIONS} onChange={settings.setNoteNaming} />
        </Card>
        <Card title="Tamanho da partitura" className="grid gap-2">
          <RadioGroup name="staff" value={settings.staffScale} options={STAFF_SCALES.map((scale) => ({ value: scale, label: STAFF_LABELS[scale] }))} onChange={settings.setStaffScale} />
          <p className="text-caption text-ink-subtle">Vale para a pauta rolando na tela Tocar.</p>
        </Card>
        <Card title="Meta diária" className="grid gap-2">
          <RadioGroup name="goal" value={stats.dailyGoalXp} options={GOAL_OPTIONS.map((xp) => ({ value: xp, label: `${xp} XP` }))} onChange={(xp) => void setDailyGoal(xp)} />
          <p className="text-caption text-ink-subtle">Nota perfeita vale 3 XP, boa vale 1; a sessão completa dá 50.</p>
        </Card>
        <MicrofoneCard />
        <Card title="Atraso do som" className="grid gap-2">
          <p className="text-ink-muted">Mede quanto tempo o som leva do alto-falante até a detecção, para o jogo julgar o ritmo no tempo certo.</p>
          <Link to="/ferramentas/latencia" className="font-semibold text-primary">
            Abrir o teste de latência
          </Link>
        </Card>
        <DadosCard />
      </div>
    </>
  );
}

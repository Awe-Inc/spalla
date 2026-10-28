import { useEffect, useState } from "react";

import { useSettings, type NoteNaming, type ThemePreference } from "@/app/settings";
import { listInputDevices } from "@/audio/PitchInput";
import { Card, PageTitle } from "@/design/components";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "Igual ao sistema" },
  { value: "light", label: "Claro" },
  { value: "dark", label: "Escuro" },
];

const NAMING_OPTIONS: { value: NoteNaming; label: string }[] = [
  { value: "latin", label: "Dó, Ré, Mi" },
  { value: "letters", label: "C, D, E" },
];

function RadioGroup<T extends string>({ name, value, options, onChange }: { name: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {options.map((option) => (
        <label
          key={option.value}
          className={`inline-flex h-10 cursor-pointer items-center rounded-pill px-4 font-medium transition-colors ${
            option.value === value ? "bg-primary-soft text-primary" : "bg-surface-soft text-ink-muted hover:text-ink"
          }`}
        >
          <input type="radio" name={name} value={option.value} checked={option.value === value} onChange={() => onChange(option.value)} className="sr-only" />
          {option.label}
        </label>
      ))}
    </div>
  );
}

export function ConfiguracoesPage() {
  const settings = useSettings();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    if (!navigator.mediaDevices) return;
    listInputDevices()
      .then(setDevices)
      .catch(() => setDevices([]));
  }, []);

  return (
    <>
      <PageTitle title="Configurações" />
      <div className="grid gap-6">
        <Card title="Aparência">
          <RadioGroup name="theme" value={settings.theme} options={THEME_OPTIONS} onChange={settings.setTheme} />
        </Card>
        <Card title="Nome das notas">
          <RadioGroup name="naming" value={settings.noteNaming} options={NAMING_OPTIONS} onChange={settings.setNoteNaming} />
        </Card>
        <Card title="Microfone" className="grid gap-3">
          <select
            className="h-11 rounded-md border border-hairline bg-surface px-3 text-body"
            value={settings.inputDeviceId ?? ""}
            onChange={(event) => settings.setInputDevice(event.target.value || null)}
            aria-label="Microfone"
          >
            <option value="">Padrão do sistema</option>
            {devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || "Microfone sem nome"}
              </option>
            ))}
          </select>
          <p className="text-caption text-ink-subtle">Os nomes aparecem depois que você permitir o microfone uma vez no Afinador.</p>
        </Card>
      </div>
    </>
  );
}

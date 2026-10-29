import { useEffect, useState } from "react";

import { useSettings } from "@/app/settings";
import { isStoredDeviceMissing } from "@/audio/devices";
import { listInputDevices } from "@/audio/PitchInput";
import { usePitchInput } from "@/audio/usePitchInput";
import { useCore } from "@/core/useCore";
import { FIELD_CLASS } from "@/design/fields";
import { Button, Card, InlineError } from "@/design/components";
import { Tuner } from "@/design/Tuner";
import { tunerReading } from "@/music/tunerReading";

export function MicrofoneCard() {
  const core = useCore();
  const mic = usePitchInput();
  const settings = useSettings();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const { inputDeviceId, setInputDevice } = settings;

  useEffect(() => {
    if (!navigator.mediaDevices) return;
    listInputDevices()
      .then(setDevices)
      .catch(() => setDevices([]));
  }, [mic.status.status]);

  useEffect(() => {
    if (isStoredDeviceMissing(inputDeviceId, devices)) setInputDevice(null);
  }, [inputDeviceId, devices, setInputDevice]);

  const reading = core.status === "ready" ? tunerReading(core.core, mic.frame, settings.noteNaming) : null;

  return (
    <Card title="Microfone" className="grid gap-4">
      <select
        className={FIELD_CLASS}
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
      <p className="text-caption text-ink-subtle">Os nomes aparecem depois que você permitir o microfone uma vez.</p>
      <div className="grid gap-3">
        <Tuner compact noteLabel={reading?.note ?? null} cents={reading?.cents ?? null} />
        {mic.status.status === "error" ? <InlineError title="O microfone não abriu." nextStep={mic.status.message} /> : null}
        {mic.frame?.clipped ? <p className="text-caption text-off">O sinal está saturando. Baixe a sensibilidade ou afaste o microfone.</p> : null}
        <div>
          {mic.status.status === "listening" ? (
            <Button onClick={() => void mic.stop()}>Parar teste</Button>
          ) : (
            <Button onClick={() => void mic.start()} disabled={mic.status.status === "starting" || core.status !== "ready"}>
              {mic.status.status === "starting" ? "Abrindo microfone…" : "Testar microfone"}
            </Button>
          )}
        </div>
      </div>
      <label className="grid gap-1">
        <span className="flex justify-between text-caption text-ink-subtle">
          <span>Sensibilidade</span>
          <span className="font-mono tabular">×{settings.inputGain.toFixed(2)}</span>
        </span>
        <input type="range" min={0.25} max={4} step={0.25} value={settings.inputGain} className="accent-primary" onChange={(event) => settings.setInputGain(Number(event.target.value))} />
        <span className="text-caption text-ink-subtle">Baixa ignora ruído de fundo; alta pega um violino longe do microfone.</span>
      </label>
    </Card>
  );
}

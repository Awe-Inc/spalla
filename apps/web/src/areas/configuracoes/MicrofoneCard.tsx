import { useEffect, useState } from "react";

import { useSettings } from "@/app/settings";
import { isStoredDeviceMissing } from "@/audio/devices";
import { addFrame, EMPTY_MIC_CHECK, type MicCheck, micAdvice, readRatio, toDecibels } from "@/audio/micCheck";
import { processingWarning } from "@/audio/micProcessing";
import { listInputDevices } from "@/audio/PitchInput";
import { usePitchInput } from "@/audio/usePitchInput";
import { useCore } from "@/core/useCore";
import { FIELD_CLASS } from "@/design/fields";
import { Button, Card, InlineError } from "@/design/components";
import { Tuner } from "@/design/Tuner";
import { displayNoteName } from "@/music/noteNames";
import { midiFromFrequency, tunerReading } from "@/music/tunerReading";

export function MicrofoneCard() {
  const core = useCore();
  const mic = usePitchInput();
  const { takeFrames } = mic;
  const settings = useSettings();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [check, setCheck] = useState<MicCheck>(EMPTY_MIC_CHECK);
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

  useEffect(() => {
    if (mic.status.status !== "listening") return;
    const frames = takeFrames();
    if (frames.length > 0) setCheck((previous) => frames.reduce(addFrame, previous));
  }, [mic.frame, mic.status.status, takeFrames]);

  const reading = core.status === "ready" ? tunerReading(core.core, mic.frame, settings.noteNaming) : null;
  const processing = mic.status.status === "listening" ? processingWarning(mic.status.info.browserProcessing) : null;
  const highest = core.status === "ready" && check.highestHz > 0 ? displayNoteName(core.core.noteName(midiFromFrequency(check.highestHz)), settings.noteNaming) : null;
  const ratio = readRatio(check);

  const startTest = () => {
    setCheck(EMPTY_MIC_CHECK);
    void mic.start();
  };

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
        {processing ? <p className="text-caption text-close">{processing}</p> : null}
        {mic.status.status === "listening" ? (
          <div className="grid gap-2" aria-live="polite">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-caption sm:grid-cols-4">
              <div>
                <dt className="text-ink-subtle">Pico</dt>
                <dd className="font-mono tabular">{Math.round(toDecibels(check.peakRms))} dB</dd>
              </div>
              <div>
                <dt className="text-ink-subtle">Ruído do ambiente</dt>
                <dd className="font-mono tabular">{Math.round(toDecibels(check.noiseFloor))} dB</dd>
              </div>
              <div>
                <dt className="text-ink-subtle">Notas lidas</dt>
                <dd className="font-mono tabular">{ratio === null ? "…" : `${Math.round(ratio * 100)}%`}</dd>
              </div>
              <div>
                <dt className="text-ink-subtle">Nota mais aguda</dt>
                <dd className="font-mono tabular">{highest ?? "…"}</dd>
              </div>
            </dl>
            {micAdvice(check).map((line) => (
              <p key={line} className="text-caption text-ink-muted">
                {line}
              </p>
            ))}
          </div>
        ) : null}
        <div>
          {mic.status.status === "listening" ? (
            <Button onClick={() => void mic.stop()}>Parar teste</Button>
          ) : (
            <Button onClick={startTest} disabled={mic.status.status === "starting" || core.status !== "ready"}>
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

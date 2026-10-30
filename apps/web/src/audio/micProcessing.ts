export type BrowserProcessing = "echoCancellation" | "noiseSuppression" | "autoGainControl";

const PROCESSING_LABELS: Record<BrowserProcessing, { name: string; feminine: boolean }> = {
  echoCancellation: { name: "o cancelamento de eco", feminine: false },
  noiseSuppression: { name: "a supressão de ruído", feminine: true },
  autoGainControl: { name: "o ganho automático", feminine: false },
};

const PROCESSING_ORDER = Object.keys(PROCESSING_LABELS) as BrowserProcessing[];

export function activeProcessing(settings: MediaTrackSettings): BrowserProcessing[] {
  return PROCESSING_ORDER.filter((key) => settings[key] === true);
}

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

export function processingWarning(active: readonly BrowserProcessing[]): string | null {
  const labels = active.map((key) => PROCESSING_LABELS[key]);
  const [first] = labels;
  if (!first) return null;
  const ending = labels.length > 1 ? "ligados" : first.feminine ? "ligada" : "ligado";
  return `O navegador deixou ${joinNames(labels.map((label) => label.name))} ${ending} no microfone. Isso pode cortar notas agudas e notas longas. Se puder, desligue nas configurações de som do sistema ou use outro navegador.`;
}

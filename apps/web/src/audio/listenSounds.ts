export const LISTEN_SOUNDS = ["violino", "sintetizado", "suave", "puro"] as const;
export type ListenSound = (typeof LISTEN_SOUNDS)[number];

export interface SynthVoice {
  type: OscillatorType;
  filterHz: number;
  level: number;
}

export const LISTEN_SOUND_OPTIONS: ReadonlyArray<{ value: ListenSound; label: string; hint: string }> = [
  { value: "violino", label: "Violino", hint: "Gravação de violino de verdade." },
  { value: "sintetizado", label: "Sintetizado", hint: "Corda eletrônica, brilhante." },
  { value: "suave", label: "Suave", hint: "Som redondo, parecido com flauta." },
  { value: "puro", label: "Puro", hint: "Onda senoidal, boa para comparar a afinação." },
];

const SYNTH_VOICES: Record<Exclude<ListenSound, "violino">, SynthVoice> = {
  sintetizado: { type: "sawtooth", filterHz: 1800, level: 0.35 },
  suave: { type: "triangle", filterHz: 3000, level: 0.6 },
  puro: { type: "sine", filterHz: 8000, level: 0.7 },
};

export function isListenSound(value: unknown): value is ListenSound {
  return typeof value === "string" && (LISTEN_SOUNDS as readonly string[]).includes(value);
}

export function usesRecordedViolin(sound: ListenSound): boolean {
  return sound === "violino";
}

export function synthVoice(sound: ListenSound): SynthVoice {
  return sound === "violino" ? SYNTH_VOICES.sintetizado : SYNTH_VOICES[sound];
}

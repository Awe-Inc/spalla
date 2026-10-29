import type { NoteNaming } from "@/app/settings";

const LATIN_BY_LETTER: Record<string, string> = {
  C: "Dó",
  D: "Ré",
  E: "Mi",
  F: "Fá",
  G: "Sol",
  A: "Lá",
  B: "Si",
};

export function toLatinName(letterName: string): string {
  const letter = letterName.charAt(0).toUpperCase();
  const latin = LATIN_BY_LETTER[letter];
  return latin ? `${latin}${letterName.slice(1)}` : letterName;
}

export function displayNoteName(letterName: string, naming: NoteNaming): string {
  return naming === "latin" ? toLatinName(letterName) : letterName;
}

export function formatCents(cents: number): string {
  const rounded = Math.round(cents);
  if (rounded === 0) return "afinado";
  return rounded > 0 ? `${rounded} cents alto` : `${-rounded} cents baixo`;
}

const MAJOR_KEYS_FROM_SEVEN_FLATS = ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"];
const SEVEN_ACCIDENTALS = 7;

export function majorKeyName(fifths: number, naming: NoteNaming): string {
  const letterName = MAJOR_KEYS_FROM_SEVEN_FLATS[Math.round(fifths) + SEVEN_ACCIDENTALS];
  if (!letterName) return "Armadura incomum";
  return `${displayNoteName(letterName, naming)} maior`;
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes === 0) return `${rest} s`;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

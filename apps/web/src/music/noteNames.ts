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

import type { PageStyle, PlayView, ReadingGuide } from "@/app/settings";

export interface ViewOption<T> {
  value: T;
  label: string;
}

export const VIEW_OPTIONS: readonly ViewOption<PlayView>[] = [
  { value: "pagina", label: "Página" },
  { value: "pauta", label: "Pauta rolando" },
  { value: "pistas", label: "Pistas das cordas" },
  { value: "ambos", label: "Pistas e pauta" },
];

export const PAGE_STYLE_OPTIONS: readonly ViewOption<PageStyle>[] = [
  { value: "papel", label: "Papel" },
  { value: "sepia", label: "Sépia" },
  { value: "noite", label: "Noite" },
];

export const READING_GUIDE_OPTIONS: readonly ViewOption<ReadingGuide>[] = [
  { value: "nota", label: "Nota a nota" },
  { value: "compasso", label: "Compasso" },
  { value: "nenhum", label: "Sem guia" },
];

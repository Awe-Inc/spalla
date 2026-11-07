import type { NoteJudgement, Score, ScoreEvent } from "@fretless/core";

import type { NoteNaming } from "@/app/settings";
import { STRING_NAMES } from "@/design/components";
import { displayNoteName } from "@/music/noteNames";

import type { MeasureStat } from "./measureMap";

export type ErrorKind = "afinacao" | "ritmo" | "nao-ouvida";
export type ErrorDirection = "alta" | "baixa" | "adiantada" | "atrasada";

export interface NoteError {
  eventIndex: number;
  measureIndex: number;
  noteName: string;
  string: number;
  kind: ErrorKind;
  direction: ErrorDirection | null;
}

export interface ErrorNote {
  noteName: string;
  string: number;
  count: number;
}

export interface ErrorGroup {
  kind: ErrorKind;
  count: number;
  notes: ErrorNote[];
  directions: Partial<Record<ErrorDirection, number>>;
}

const AUDIBLY_OUT_CENTS = 20;
const LOOSE_ONSET_SEC = 0.12;
const NOTES_SHOWN = 3;
const KIND_ORDER: readonly ErrorKind[] = ["afinacao", "ritmo", "nao-ouvida"];
const DIRECTION_ORDER: readonly ErrorDirection[] = ["baixa", "alta", "atrasada", "adiantada"];
const DIRECTION_PLURAL: Record<ErrorDirection, string> = { alta: "altas", baixa: "baixas", adiantada: "adiantadas", atrasada: "atrasadas" };

export const ERROR_KIND_LABELS: Record<ErrorKind, string> = { afinacao: "Afinação", ritmo: "Ritmo", "nao-ouvida": "Não ouvidas" };

function errorsOfNote(event: ScoreEvent, judgement: NoteJudgement): NoteError[] {
  const base = { eventIndex: judgement.eventIndex, measureIndex: event.measureIndex, noteName: event.noteName, string: event.string };
  if (judgement.grade === "Unheard") return [{ ...base, kind: "nao-ouvida", direction: null }];
  if (judgement.grade === "Miss") return [{ ...base, kind: judgement.offTuneRatio > 0 ? "afinacao" : "nao-ouvida", direction: null }];
  const errors: NoteError[] = [];
  if (Math.abs(judgement.meanCents) > AUDIBLY_OUT_CENTS) errors.push({ ...base, kind: "afinacao", direction: judgement.meanCents > 0 ? "alta" : "baixa" });
  if (Math.abs(judgement.onsetErrorSec) > LOOSE_ONSET_SEC) errors.push({ ...base, kind: "ritmo", direction: judgement.onsetErrorSec > 0 ? "atrasada" : "adiantada" });
  return errors;
}

export function noteErrors(score: Score, judgements: readonly NoteJudgement[]): NoteError[] {
  return judgements.flatMap((judgement) => {
    const event = score.events[judgement.eventIndex];
    return event ? errorsOfNote(event, judgement) : [];
  });
}

export function groupErrors(errors: readonly NoteError[]): ErrorGroup[] {
  return KIND_ORDER.flatMap((kind) => {
    const ofKind = errors.filter((error) => error.kind === kind);
    if (ofKind.length === 0) return [];
    const notes = new Map<string, ErrorNote>();
    const directions: ErrorGroup["directions"] = {};
    for (const error of ofKind) {
      const key = `${error.noteName}/${error.string}`;
      const note = notes.get(key);
      notes.set(key, { noteName: error.noteName, string: error.string, count: (note?.count ?? 0) + 1 });
      if (error.direction) directions[error.direction] = (directions[error.direction] ?? 0) + 1;
    }
    return [{ kind, count: ofKind.length, notes: [...notes.values()].sort((a, b) => b.count - a.count), directions }];
  });
}

function noteLabel(note: ErrorNote, naming: NoteNaming): string {
  const times = note.count > 1 ? ` (${note.count} vezes)` : "";
  const stringName = STRING_NAMES[note.string];
  return `${displayNoteName(note.noteName, naming)}${stringName ? ` na corda ${stringName}` : ""}${times}`;
}

function directionsLabel(directions: ErrorGroup["directions"]): string {
  const parts = DIRECTION_ORDER.flatMap((direction) => {
    const count = directions[direction];
    if (!count) return [];
    return [`${count} ${count === 1 ? direction : DIRECTION_PLURAL[direction]}`];
  });
  return parts.length > 0 ? ` ${parts.join(", ")}.` : "";
}

export function errorGroupSentence(group: ErrorGroup, naming: NoteNaming): string {
  const shown = group.notes.slice(0, NOTES_SHOWN).map((note) => noteLabel(note, naming));
  const others = group.notes.length - shown.length;
  const more = others > 0 ? `, e mais ${others} ${others === 1 ? "nota" : "notas"}` : "";
  return `${shown.join(", ")}${more}.${directionsLabel(group.directions)}`;
}

export function measureTitle(stat: MeasureStat): string {
  if (stat.accuracyPct === null) return `Compasso ${stat.measureNumber}: não tocado`;
  return `Compasso ${stat.measureNumber}: ${Math.round(stat.accuracyPct)}% certas`;
}

export function measureSentence(stat: MeasureStat, errors: readonly NoteError[], naming: NoteNaming): string {
  const groups = groupErrors(errors.filter((error) => error.measureIndex === stat.measureIndex));
  if (groups.length === 0) return `${measureTitle(stat)}.${stat.accuracyPct === null ? "" : " Nenhum erro a apontar."}`;
  const details = groups.map((group) => `${ERROR_KIND_LABELS[group.kind]}: ${errorGroupSentence(group, naming)}`);
  return `${measureTitle(stat)}. ${details.join(" ")}`;
}

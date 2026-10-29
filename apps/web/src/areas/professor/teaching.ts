import type { Exercise } from "@fretless/core";

import type { AssignmentItem, AssignmentItemKind, Audience, MaterialKind, PlanBlock } from "@/api/types";
import type { LibraryPiece } from "@/data/library";
import { goalFor } from "@/data/routines";

export const MAX_ITEMS = 20;
export const MAX_BLOCK_MINUTES = 30;
export const MAX_PDF_BYTES = 20 * 1024 * 1024;

export const ITEM_KIND_LABELS: Record<AssignmentItemKind, string> = {
  exercicio: "Exercício",
  peca: "Peça",
  texto: "Orientação",
};

export const MATERIAL_KIND_LABELS: Record<MaterialKind, string> = {
  link: "Link",
  text: "Texto",
  pdf: "PDF",
};

const PDF_SIGNATURE = "%PDF-";

export async function looksLikePdf(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, PDF_SIGNATURE.length).arrayBuffer());
  return String.fromCharCode(...head) === PDF_SIGNATURE;
}

export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function formatDueOn(dueOn: string | null): string {
  if (!dueOn) return "Sem prazo";
  const [year, month, day] = dueOn.split("-");
  return `${day}/${month}/${year}`;
}

export const GOAL_TEXT: Record<PlanBlock["goal"], string> = {
  tempo: "pelo tempo do bloco",
  "repeticoes-limpas": "repetições limpas",
  estrelas: "estrelas",
  "uma-vez": "uma vez",
};

export interface TeachableItem {
  key: string;
  kind: Exclude<AssignmentItemKind, "texto">;
  title: string;
  detail: string;
  level: number;
  playPath: string;
  ref: string;
}

export function teachableItems(exercises: readonly Exercise[], library: readonly LibraryPiece[]): TeachableItem[] {
  const fromCurriculum = exercises
    .filter((exercise) => exercise.playable)
    .map<TeachableItem>((exercise) => ({
      key: exercise.id,
      kind: exercise.kind === "piece" ? "peca" : "exercicio",
      title: exercise.title,
      detail: exercise.subtitle,
      level: exercise.level,
      playPath: `/tocar/${exercise.id}`,
      ref: exercise.id,
    }));
  const fromLibrary = library.map<TeachableItem>((piece) => ({
    key: `biblioteca:${piece.slug}`,
    kind: "peca",
    title: piece.title,
    detail: piece.composer,
    level: piece.level,
    playPath: `/tocar/biblioteca/${piece.slug}`,
    ref: `biblioteca:${piece.slug}`,
  }));
  return [...fromCurriculum, ...fromLibrary];
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function searchItems(items: readonly TeachableItem[], query: string, limit = 30): TeachableItem[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return items.slice(0, limit);
  return items.filter((item) => terms.every((term) => normalize(`${item.title} ${item.detail}`).includes(term))).slice(0, limit);
}

export function itemFromTeachable(item: TeachableItem): AssignmentItem {
  return { kind: item.kind, title: item.title.slice(0, 120), ref: item.ref, playPath: item.playPath };
}

export function textItem(title: string): AssignmentItem {
  return { kind: "texto", title: title.trim().slice(0, 120) };
}

export function blockFromTeachable(item: TeachableItem | null, type: PlanBlock["type"], minutes: number): PlanBlock {
  const base: PlanBlock = { type, itemId: "", ...goalFor(type), durationMinutes: Math.min(MAX_BLOCK_MINUTES, Math.max(1, Math.round(minutes))) };
  if (!item) return base;
  return { ...base, itemId: item.ref, itemTitle: item.title.slice(0, 120), itemPath: item.playPath };
}

export type AudienceChoice = `turma:${string}` | `aluno:${string}` | "";

export function audienceFromChoice(choice: AudienceChoice): Audience | null {
  if (choice.startsWith("turma:")) return { classId: choice.slice("turma:".length) };
  if (choice.startsWith("aluno:")) return { studentId: choice.slice("aluno:".length) };
  return null;
}

export function choiceFromAudience(classId: string | null, studentId: string | null): AudienceChoice {
  if (classId) return `turma:${classId}`;
  if (studentId) return `aluno:${studentId}`;
  return "";
}

export function moveItem<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return [...list];
  const next = [...list];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

export function replaceAt<T>(list: readonly T[], index: number, value: T): T[] {
  return list.map((current, position) => (position === index ? value : current));
}

export function removeAt<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, position) => position !== index);
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export function audienceLabel(className: string | null, studentName: string | null): string {
  if (className) return `Turma ${className}`;
  if (studentName) return studentName;
  return "—";
}

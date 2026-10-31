export interface TocarOrigin {
  to: string;
  label: string;
}

const AREA_LABELS: readonly (readonly [string, string])[] = [
  ["/estudar", "Estudar"],
  ["/repertorio", "Repertório"],
  ["/aulas", "Minhas aulas"],
  ["/ferramentas", "Ferramentas"],
  ["/voce", "Você"],
];

function isInternalPath(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
}

function labelFor(path: string): string | null {
  if (path === "/" || path.startsWith("/?")) return "Hoje";
  const match = AREA_LABELS.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`));
  return match ? match[1] : null;
}

const NEXT_BLOCK_ORIGINS = ["/", "/estudar"];

export function offersNextBlock(origin: TocarOrigin): boolean {
  return NEXT_BLOCK_ORIGINS.some((path) => (path === "/" ? labelFor(origin.to) === "Hoje" : origin.to === path || origin.to.startsWith(`${path}/`) || origin.to.startsWith(`${path}?`)));
}

export function fromState(path: string): { from: string } {
  return { from: path };
}

export function tocarOrigin(state: unknown, isCurriculumExercise: boolean): TocarOrigin {
  const from = typeof state === "object" && state !== null && "from" in state ? (state as { from: unknown }).from : undefined;
  if (isInternalPath(from)) {
    const label = labelFor(from);
    if (label) return { to: from, label };
  }
  return isCurriculumExercise ? { to: "/estudar/metodo", label: "Estudar" } : { to: "/repertorio", label: "Repertório" };
}

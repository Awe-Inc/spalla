import { findBarlines, isRepeatEnd, isRepeatStart, isSystemOpening, type Barline } from "./barlines";
import { findNavigationSymbols, findVoltaBrackets, navigationFromText, type NavigationKind, type NavigationMark, type PageText, type VoltaBracket } from "./marks";
import { estimateSkewSlope, straightened, type InkImage } from "./raster";
import { findStaves, groupSystems, type StaffSystem } from "./staves";

export interface ScoreMeasure {
  readonly page: number;
  readonly system: number;
  readonly x0: number;
  readonly x1: number;
  readonly top: number;
  readonly bottom: number;
  readonly repeatStart?: boolean;
  readonly repeatEnd?: boolean;
  readonly endings?: readonly number[];
  readonly segno?: boolean;
  readonly coda?: boolean;
  readonly toCoda?: boolean;
  readonly dalSegno?: boolean;
  readonly daCapo?: boolean;
  readonly fine?: boolean;
}

export interface ScoreStructure {
  readonly measures: readonly ScoreMeasure[];
  readonly hasTextLayer: boolean;
}

const TRAILING_MEASURE_SPACES = 4;
const LEADING_NOTHING_SPACES = 2;

function measuresOfSystem(system: StaffSystem, bars: readonly Barline[], pageIndex: number, systemIndex: number, image: InkImage): ScoreMeasure[] {
  const spacing = system.staves[0]?.spacing ?? 1;
  const staff = system.staves[0];
  if (!staff) return [];
  const opening = bars[0] && isSystemOpening(bars[0], staff) ? bars[0] : null;
  const closing = opening ? bars.slice(1) : bars;
  const edges: Array<{ x: number; bar: Barline | null }> = [{ x: opening?.x ?? system.left, bar: opening }];
  for (const bar of closing) edges.push({ x: bar.x, bar });
  const lastX = edges.at(-1)?.x ?? system.left;
  if (system.right - lastX > spacing * TRAILING_MEASURE_SPACES) edges.push({ x: system.right, bar: null });
  const measures: ScoreMeasure[] = [];
  for (let i = 1; i < edges.length; i += 1) {
    const before = edges[i - 1];
    const after = edges[i];
    if (!before || !after || after.x - before.x < spacing * LEADING_NOTHING_SPACES) continue;
    measures.push({
      page: pageIndex,
      system: systemIndex,
      x0: before.x / image.width,
      x1: after.x / image.width,
      top: system.top / image.height,
      bottom: system.bottom / image.height,
      ...(before.bar && isRepeatStart(before.bar) ? { repeatStart: true } : {}),
      ...(after.bar && isRepeatEnd(after.bar) ? { repeatEnd: true } : {}),
    });
  }
  return measures;
}

function withMark(measure: ScoreMeasure, kind: NavigationKind): ScoreMeasure {
  return { ...measure, [kind]: true };
}

function applyNavigation(measures: readonly ScoreMeasure[], marks: readonly NavigationMark[], width: number): ScoreMeasure[] {
  let result = [...measures];
  for (const mark of marks) {
    const x = mark.x / width;
    const inSystem = result
      .map((measure, index) => ({ measure, index }))
      .filter(({ measure }) => measure.system === mark.system);
    const hit =
      inSystem.find(({ measure }) => x >= measure.x0 && x <= measure.x1) ??
      inSystem.reduce<{ measure: ScoreMeasure; index: number } | undefined>((best, entry) => {
        if (!best) return entry;
        const distance = (m: ScoreMeasure) => Math.min(Math.abs(x - m.x0), Math.abs(x - m.x1));
        return distance(entry.measure) < distance(best.measure) ? entry : best;
      }, undefined);
    if (hit) result = result.map((measure, index) => (index === hit.index ? withMark(measure, mark.kind) : measure));
  }
  return result;
}

function applyVoltas(measures: readonly ScoreMeasure[], brackets: readonly VoltaBracket[], width: number): ScoreMeasure[] {
  return measures.map((measure) => {
    const numbers = brackets
      .filter((bracket) => bracket.system === measure.system)
      .filter((bracket) => {
        const overlap = Math.min(bracket.x1 / width, measure.x1) - Math.max(bracket.x0 / width, measure.x0);
        return overlap > (measure.x1 - measure.x0) * 0.5;
      })
      .map((bracket) => bracket.number ?? 0);
    return numbers.length > 0 ? { ...measure, endings: numbers } : measure;
  });
}

export function numberUnnamedVoltas(measures: readonly ScoreMeasure[]): ScoreMeasure[] {
  let lastNumber = 0;
  let wasInVolta = false;
  let previousValue = -1;
  let previousClosedRepeat = false;
  return measures.map((measure) => {
    const value = measure.endings?.[0];
    const closedBefore = previousClosedRepeat;
    previousClosedRepeat = Boolean(measure.repeatEnd);
    if (value === undefined) {
      wasInVolta = false;
      return measure;
    }
    if (value !== 0) {
      lastNumber = value;
      wasInVolta = true;
      previousValue = value;
      return measure;
    }
    const continues = wasInVolta && previousValue === 0 && !measure.repeatStart && !closedBefore;
    lastNumber = wasInVolta ? (continues ? lastNumber : lastNumber + 1) : 1;
    wasInVolta = true;
    previousValue = 0;
    return { ...measure, endings: [lastNumber] };
  });
}

export function analyzePage(source: InkImage, texts: readonly PageText[], pageIndex: number): ScoreMeasure[] {
  const image = straightened(source, estimateSkewSlope(source));
  const systems = groupSystems(image, findStaves(image));
  const perSystem = systems.flatMap((system, index) => measuresOfSystem(system, findBarlines(image, system), pageIndex, index, image));
  const fromText = navigationFromText(texts, systems);
  const fromShape = texts.length === 0 ? findNavigationSymbols(image, systems) : findNavigationSymbols(image, systems).filter((mark) => !fromText.some((known) => known.kind === mark.kind && known.system === mark.system));
  const brackets = findVoltaBrackets(image, systems, texts);
  return applyVoltas(applyNavigation(perSystem, [...fromText, ...fromShape], image.width), brackets, image.width);
}

export function assembleStructure(pages: ReadonlyArray<readonly ScoreMeasure[]>, hasTextLayer: boolean): ScoreStructure {
  return { measures: numberUnnamedVoltas(resolveCodaGlyphs(pages.flat())), hasTextLayer };
}

function resolveCodaGlyphs(measures: readonly ScoreMeasure[]): ScoreMeasure[] {
  const codas = measures.flatMap((measure, index) => (measure.coda ? [index] : []));
  const hasToCoda = measures.some((measure) => measure.toCoda);
  if (codas.length < 2 || hasToCoda) return [...measures];
  const first = codas[0];
  return measures.map((measure, index) => {
    if (index !== first) return measure;
    const { coda: _coda, ...rest } = measure;
    return { ...rest, toCoda: true };
  });
}

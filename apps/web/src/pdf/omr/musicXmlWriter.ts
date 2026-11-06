import type { TimedMeasure } from "./meter";
import { midiOf, stepOfPosition, type ReadNote } from "./readMeasure";
import type { ScoreMeasure } from "./structure";

const DIVISIONS = 48;
const STEP_NAMES = ["C", "D", "E", "F", "G", "A", "B"];
const TYPE_BY_QUARTERS: ReadonlyArray<readonly [number, string]> = [
  [4, "whole"],
  [2, "half"],
  [1, "quarter"],
  [0.5, "eighth"],
  [0.25, "16th"],
  [0.125, "32nd"],
];
const DOT_FACTORS = [1, 1.5, 1.75];
const TRIPLET_RATIO = 2 / 3;
const EPSILON = 0.01;

export interface WrittenPiece {
  readonly title: string;
  readonly bpm: number | null;
  readonly measures: readonly TimedMeasure[];
  readonly structure: readonly ScoreMeasure[];
}

function escaped(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const MAX_WRITTEN_ALTER = 1;
const SEMITONES_IN_OCTAVE = 12;
const SPELLING_BY_PITCH_CLASS: readonly { step: string; alter: number }[] = [
  { step: "C", alter: 0 },
  { step: "C", alter: 1 },
  { step: "D", alter: 0 },
  { step: "E", alter: -1 },
  { step: "E", alter: 0 },
  { step: "F", alter: 0 },
  { step: "F", alter: 1 },
  { step: "G", alter: 0 },
  { step: "A", alter: -1 },
  { step: "A", alter: 0 },
  { step: "B", alter: -1 },
  { step: "B", alter: 0 },
];

function typeOf(note: ReadNote): string {
  const undotted = note.quarters / (DOT_FACTORS[note.dots] ?? 1) / (note.triplet ? TRIPLET_RATIO : 1);
  return TYPE_BY_QUARTERS.reduce((best, entry) => (Math.abs(entry[0] - undotted) < Math.abs(best[0] - undotted) ? entry : best))[1];
}

function durationOf(note: ReadNote): number {
  return Math.max(1, Math.round(note.quarters * DIVISIONS));
}

function respelledPitchXml(midi: number): string {
  const pitchClass = ((midi % SEMITONES_IN_OCTAVE) + SEMITONES_IN_OCTAVE) % SEMITONES_IN_OCTAVE;
  const { step, alter } = SPELLING_BY_PITCH_CLASS[pitchClass] ?? { step: "C", alter: 0 };
  const octave = Math.floor(midi / SEMITONES_IN_OCTAVE) - 1;
  return `<pitch><step>${step}</step>${alter !== 0 ? `<alter>${alter}</alter>` : ""}<octave>${octave}</octave></pitch>`;
}

function pitchXml(position: number, midi: number): string {
  const written = midi - midiOf(position, 0);
  if (Math.abs(written) > MAX_WRITTEN_ALTER) return respelledPitchXml(midi);
  const { step, octave } = stepOfPosition(position);
  const alter = written;
  return `<pitch><step>${STEP_NAMES[step] ?? "C"}</step>${alter !== 0 ? `<alter>${alter}</alter>` : ""}<octave>${octave}</octave></pitch>`;
}

function tailXml(note: ReadNote): string {
  const dots = "<dot/>".repeat(note.dots);
  const triplet = note.triplet ? "<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>" : "";
  return `<type>${typeOf(note)}</type>${dots}${triplet}`;
}

function noteXml(note: ReadNote, tiedIn: boolean): string {
  const duration = durationOf(note);
  if (note.isRest) return `<note><rest/><duration>${duration}</duration><voice>1</voice>${tailXml(note)}</note>`;
  const ties = `${tiedIn ? '<tie type="stop"/>' : ""}${note.tiedToNext ? '<tie type="start"/>' : ""}`;
  const tied = `${tiedIn ? '<tied type="stop"/>' : ""}${note.tiedToNext ? '<tied type="start"/>' : ""}`;
  const notations = tied ? `<notations>${tied}</notations>` : "";
  return note.positions
    .map((position, index) => {
      const pitch = pitchXml(position, note.midi[index] ?? midiOf(position, 0));
      return `<note>${index > 0 ? "<chord/>" : ""}${pitch}<duration>${duration}</duration>${ties}<voice>1</voice>${tailXml(note)}${notations}</note>`;
    })
    .join("");
}

function attributesXml(measure: TimedMeasure, previous: TimedMeasure | undefined): string {
  const parts: string[] = [];
  if (!previous) parts.push(`<divisions>${DIVISIONS}</divisions>`);
  if (previous?.fifths !== measure.fifths) parts.push(`<key><fifths>${measure.fifths}</fifths></key>`);
  if (previous?.numerator !== measure.numerator || previous?.denominator !== measure.denominator) parts.push(`<time><beats>${measure.numerator}</beats><beat-type>${measure.denominator}</beat-type></time>`);
  if (previous?.isTreble !== measure.isTreble) parts.push(measure.isTreble ? "<clef><sign>G</sign><line>2</line></clef>" : "<clef><sign>F</sign><line>4</line></clef>");
  return parts.length > 0 ? `<attributes>${parts.join("")}</attributes>` : "";
}

function wordsXml(words: string): string {
  return `<direction><direction-type><words>${words}</words></direction-type></direction>`;
}

function tempoXml(bpm: number): string {
  return `<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${bpm}</per-minute></metronome></direction-type><sound tempo="${bpm}"/></direction>`;
}

function marksBeforeNotes(marks: ScoreMeasure | undefined): string {
  const segno = marks?.segno ? "<direction><direction-type><segno/></direction-type></direction>" : "";
  const coda = marks?.coda ? "<direction><direction-type><coda/></direction-type></direction>" : "";
  return segno + coda;
}

function marksAfterNotes(marks: ScoreMeasure | undefined): string {
  return [marks?.toCoda && wordsXml("To Coda"), marks?.fine && wordsXml("Fine"), marks?.dalSegno && wordsXml("D.S."), marks?.daCapo && wordsXml("D.C.")].filter(Boolean).join("");
}

function sameEndings(one: ScoreMeasure | undefined, other: ScoreMeasure | undefined): boolean {
  return (one?.endings ?? []).join() === (other?.endings ?? []).join();
}

function leftBarline(marks: ScoreMeasure | undefined, previous: ScoreMeasure | undefined): string {
  const opensEnding = (marks?.endings?.length ?? 0) > 0 && !sameEndings(marks, previous);
  const ending = opensEnding ? `<ending number="${marks?.endings?.join(",")}" type="start"/>` : "";
  const repeat = marks?.repeatStart ? '<repeat direction="forward"/>' : "";
  return ending || repeat ? `<barline location="left">${ending}${repeat}</barline>` : "";
}

function rightBarline(marks: ScoreMeasure | undefined, next: ScoreMeasure | undefined): string {
  const closesEnding = (marks?.endings?.length ?? 0) > 0 && !sameEndings(marks, next);
  const ending = closesEnding ? `<ending number="${marks?.endings?.join(",")}" type="stop"/>` : "";
  const repeat = marks?.repeatEnd ? '<repeat direction="backward"/>' : "";
  return ending || repeat ? `<barline location="right">${ending}${repeat}</barline>` : "";
}

function paddingOf(measure: TimedMeasure): string {
  const missing = measure.quarters - measure.notes.reduce((sum, note) => sum + note.quarters, 0);
  if (missing <= EPSILON) return "";
  return `<note><rest/><duration>${Math.round(missing * DIVISIONS)}</duration><voice>1</voice></note>`;
}

function notesXml(measure: TimedMeasure, tiedFromBefore: boolean): string {
  let tiedIn = tiedFromBefore;
  return measure.notes
    .map((note) => {
      const xml = noteXml(note, tiedIn && !note.isRest);
      tiedIn = note.tiedToNext;
      return xml;
    })
    .join("");
}

function measureXml(piece: WrittenPiece, index: number): string {
  const measure = piece.measures[index] as TimedMeasure;
  const previous = piece.measures[index - 1];
  const marks = piece.structure[index];
  const tiedFromBefore = previous?.notes.at(-1)?.tiedToNext ?? false;
  const tempo = index === 0 && piece.bpm !== null ? tempoXml(piece.bpm) : "";
  const body = [leftBarline(marks, piece.structure[index - 1]), attributesXml(measure, previous), tempo, marksBeforeNotes(marks), notesXml(measure, tiedFromBefore), paddingOf(measure), marksAfterNotes(marks), rightBarline(marks, piece.structure[index + 1])];
  return `<measure number="${index + 1}"${measure.isPickup ? ' implicit="yes"' : ""}>${body.join("")}</measure>`;
}

export function musicXmlFromReading(piece: WrittenPiece): string {
  const measures = piece.measures.map((_, index) => measureXml(piece, index)).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><movement-title>${escaped(piece.title)}</movement-title><part-list><score-part id="P1"><part-name>Violino</part-name></score-part></part-list><part id="P1">${measures}</part></score-partwise>`;
}

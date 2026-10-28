export type StringIndex = 0 | 1 | 2 | 3;

export interface ScoreEvent {
  startSeconds: number;
  durationSeconds: number;
  startQuarters: number;
  frequencyHz: number;
  midi: number;
  measure: number;
  measureIndex: number;
  beat: number;
  isRest: boolean;
  isTiedFrom: boolean;
  string: number;
  bowSpan: number;
  bowSlot: number;
  noteName: string;
  latinName: string;
}

export interface Measure {
  number: number;
  startQuarters: number;
  startSeconds: number;
  endSeconds: number;
  lengthQuarters: number;
  beats: number;
  beatUnit: number;
  beatOffset: number;
}

export interface BeamGroup {
  first: number;
  last: number;
}

export interface Score {
  title: string;
  composer: string;
  partName: string;
  beatsPerMinute: number;
  beatsPerMeasure: number;
  beatUnit: number;
  keyFifths: number;
  durationSeconds: number;
  noteCount: number;
  trimmedIntroSeconds: number;
  tempoScale: number;
  events: ScoreEvent[];
  measures: Measure[];
  beamGroups: BeamGroup[];
}

export type ExerciseKind =
  | "piece"
  | "long-tone"
  | "scale"
  | "string-crossing"
  | "single-string"
  | "finger-pattern"
  | "ring-tone"
  | "drone-interval"
  | "rhythm"
  | "sight-reading"
  | "interval-reading"
  | "reference";

export interface Recipe {
  tonicMidi: number;
  scale: string;
  octaves: number;
  fifths: number;
  descend: boolean;
  string: number;
  otherString: number;
  maxPosition: number;
  noteQuarters: number;
  beats: number;
  beatUnit: number;
  repeats: number;
  bow: string;
  notesPerBow: number;
  pattern: number;
  pieceIndex: number;
  bars: number;
}

export interface Exercise {
  id: string;
  moduleId: string;
  title: string;
  subtitle: string;
  focus: string;
  howTo: string;
  source: string;
  level: number;
  defaultBpm: number;
  minBpm: number;
  maxBpm: number;
  kind: ExerciseKind;
  playable: boolean;
  droneMidi: number;
  metronome: boolean;
  freshEveryTime: boolean;
  recipe: Recipe;
}

export interface CurriculumModule {
  id: string;
  title: string;
  tagline: string;
  description: string;
  accent: number;
  levelFrom: number;
  levelTo: number;
  exercises: Exercise[];
}

export interface ParseOptions {
  partIndex?: number;
  expandRepeats?: boolean;
  trimSilentIntro?: boolean;
  mergeTies?: boolean;
}

export type ParseResult = { ok: true; score: Score } | { ok: false; error: string };

export interface PitchFrame {
  streamTimeSec: number;
  blockIndex: number;
  frequencyHz: number;
  confidence: number;
  rmsLinear: number;
  silent: boolean;
  lowConfidence: boolean;
  clipped: boolean;
}

export type SessionState = "idle" | "countdown" | "playing" | "paused" | "finished";

export type Grade = "Perfect" | "Great" | "Good" | "Miss";

export interface GameStats {
  score: number;
  combo: number;
  maxCombo: number;
  perfect: number;
  great: number;
  good: number;
  miss: number;
  judgedNotes: number;
  accuracyPct: number;
  meanAbsCents: number;
  meanSignedCents: number;
}

export interface NoteJudgement {
  eventIndex: number;
  grade: Grade;
  meanCents: number;
  worstCents: number;
  onsetErrorSec: number;
  voicedRatio: number;
  points: number;
  comboAfter: number;
  judgedAtSec: number;
}

export interface MeasureRange {
  firstIndex: number;
  lastIndex: number;
}

export interface SimulationConfig {
  centsBias?: number;
  centsJitter?: number;
  missProbability?: number;
  seed?: number;
}

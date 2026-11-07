import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { Subdivision } from "@/audio/clickTrack";
import { LISTEN_SOUNDS, type ListenSound } from "@/audio/listenSounds";
import type { ClickSound } from "@/audio/metronome";
import { TEMPO_MAX_BPM, TEMPO_MIN_BPM } from "@/audio/tempoClock";

export type ThemePreference = "system" | "light" | "dark";
export type NoteNaming = "latin" | "letters";
export type Accent = "padrao" | "sepia";
export const STAFF_SCALES = [1, 1.25, 1.5] as const;
export type StaffScale = (typeof STAFF_SCALES)[number];
export const PLAY_VIEWS = ["pauta", "pistas", "ambos", "pagina"] as const;
export type PlayView = (typeof PLAY_VIEWS)[number];
export const PAGE_STYLES = ["papel", "sepia", "noite"] as const;
export type PageStyle = (typeof PAGE_STYLES)[number];
export const READING_GUIDES = ["nota", "compasso", "nenhum"] as const;
export type ReadingGuide = (typeof READING_GUIDES)[number];

export interface SkippedPieces {
  day: string;
  ids: string[];
}

export interface PracticeAudioPrefs {
  metronomeOn: boolean;
  metronomeBpm: number;
  metronomeSubdivision: Subdivision;
  metronomeVolume: number;
  metronomeSound: ClickSound;
  droneVolume: number;
  listenVolume: number;
  listenSound: ListenSound;
  autoSlowdown: boolean;
}

interface SettingsState extends PracticeAudioPrefs {
  theme: ThemePreference;
  noteNaming: NoteNaming;
  inputDeviceId: string | null;
  headphonesConfirmedAt: number | null;
  routineId: number;
  onboardedAt: number | null;
  inputGain: number;
  staffScale: StaffScale;
  playView: PlayView;
  pageStyle: PageStyle;
  readingGuide: ReadingGuide;
  accent: Accent;
  lessonWeekday: number | null;
  skippedPieces: SkippedPieces;
  skipPiece: (day: string, id: string) => void;
  setLessonWeekday: (weekday: number | null) => void;
  setRoutine: (routineId: number) => void;
  completeOnboarding: () => void;
  setInputGain: (gain: number) => void;
  setStaffScale: (scale: StaffScale) => void;
  setPlayView: (view: PlayView) => void;
  setPageStyle: (style: PageStyle) => void;
  setReadingGuide: (guide: ReadingGuide) => void;
  setAccent: (accent: Accent) => void;
  setTheme: (theme: ThemePreference) => void;
  setNoteNaming: (naming: NoteNaming) => void;
  setInputDevice: (deviceId: string | null) => void;
  confirmHeadphones: () => void;
  setPracticeAudio: (prefs: Partial<PracticeAudioPrefs>) => void;
}

export const SETTINGS_VERSION = 1;

type SettingsAction = { [K in keyof SettingsState]: SettingsState[K] extends (...args: never[]) => unknown ? K : never }[keyof SettingsState];
type PersistedSettings = Omit<SettingsState, SettingsAction>;
type FieldCheck = (value: unknown) => boolean;

const MIN_INPUT_GAIN = 0.25;
const MAX_INPUT_GAIN = 4;
const LAST_WEEKDAY = 6;

const isBoolean: FieldCheck = (value) => typeof value === "boolean";
const isString: FieldCheck = (value) => typeof value === "string";
const isTimestamp: FieldCheck = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const isInteger: FieldCheck = (value) => Number.isInteger(value);
const isVolume = isBetween(0, 1);

function isBetween(min: number, max: number): FieldCheck {
  return (value) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function isOneOf(options: readonly unknown[]): FieldCheck {
  return (value) => options.includes(value);
}

function orNull(check: FieldCheck): FieldCheck {
  return (value) => value === null || check(value);
}

function isSkippedPieces(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const { day, ids } = value as Partial<SkippedPieces>;
  return typeof day === "string" && Array.isArray(ids) && ids.every(isString);
}

const SETTINGS_FIELDS: Record<keyof PersistedSettings, FieldCheck> = {
  theme: isOneOf(["system", "light", "dark"]),
  noteNaming: isOneOf(["latin", "letters"]),
  inputDeviceId: orNull(isString),
  headphonesConfirmedAt: orNull(isTimestamp),
  routineId: isInteger,
  onboardedAt: orNull(isTimestamp),
  inputGain: isBetween(MIN_INPUT_GAIN, MAX_INPUT_GAIN),
  staffScale: isOneOf(STAFF_SCALES),
  playView: isOneOf(PLAY_VIEWS),
  pageStyle: isOneOf(PAGE_STYLES),
  readingGuide: isOneOf(READING_GUIDES),
  accent: isOneOf(["padrao", "sepia"]),
  lessonWeekday: orNull((value) => isInteger(value) && isBetween(0, LAST_WEEKDAY)(value)),
  skippedPieces: isSkippedPieces,
  metronomeOn: isBoolean,
  metronomeBpm: isBetween(TEMPO_MIN_BPM, TEMPO_MAX_BPM),
  metronomeSubdivision: isOneOf([1, 2, 3, 4]),
  metronomeVolume: isVolume,
  metronomeSound: isOneOf(["madeira", "digital", "suave"]),
  droneVolume: isVolume,
  listenVolume: isVolume,
  listenSound: isOneOf(LISTEN_SOUNDS),
  autoSlowdown: isBoolean,
};

const SETTINGS_KEYS = Object.keys(SETTINGS_FIELDS) as (keyof PersistedSettings)[];

function pickPersisted(state: SettingsState): PersistedSettings {
  return Object.fromEntries(SETTINGS_KEYS.map((key) => [key, state[key]])) as unknown as PersistedSettings;
}

export function sanitizeSettings(stored: unknown): Partial<PersistedSettings> {
  if (typeof stored !== "object" || stored === null) return {};
  const fields = stored as Record<string, unknown>;
  return Object.fromEntries(SETTINGS_KEYS.filter((key) => SETTINGS_FIELDS[key](fields[key])).map((key) => [key, fields[key]])) as Partial<PersistedSettings>;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "dark",
      noteNaming: "latin",
      inputDeviceId: null,
      headphonesConfirmedAt: null,
      routineId: -25,
      onboardedAt: null,
      inputGain: 1,
      staffScale: 1,
      playView: "pauta",
      pageStyle: "papel",
      readingGuide: "nota",
      accent: "padrao",
      lessonWeekday: null,
      skippedPieces: { day: "", ids: [] },
      skipPiece: (day, id) => set(({ skippedPieces }) => ({ skippedPieces: { day, ids: skippedPieces.day === day ? [...skippedPieces.ids, id] : [id] } })),
      setLessonWeekday: (lessonWeekday) => set({ lessonWeekday }),
      setRoutine: (routineId) => set({ routineId }),
      completeOnboarding: () => set({ onboardedAt: Date.now() }),
      setInputGain: (inputGain) => set({ inputGain: Math.max(MIN_INPUT_GAIN, Math.min(MAX_INPUT_GAIN, inputGain)) }),
      setStaffScale: (staffScale) => set({ staffScale }),
      setPlayView: (playView) => set({ playView }),
      setPageStyle: (pageStyle) => set({ pageStyle }),
      setReadingGuide: (readingGuide) => set({ readingGuide }),
      setAccent: (accent) => set({ accent }),
      metronomeOn: false,
      metronomeBpm: 72,
      metronomeSubdivision: 1,
      metronomeVolume: 0.5,
      metronomeSound: "madeira",
      droneVolume: 0.35,
      listenVolume: 0.6,
      listenSound: "violino",
      autoSlowdown: true,
      setTheme: (theme) => set({ theme }),
      setNoteNaming: (noteNaming) => set({ noteNaming }),
      setInputDevice: (inputDeviceId) => set({ inputDeviceId }),
      confirmHeadphones: () => set({ headphonesConfirmedAt: Date.now() }),
      setPracticeAudio: (prefs) => set(prefs),
    }),
    {
      name: "fretless-settings",
      version: SETTINGS_VERSION,
      migrate: (persisted) => persisted as PersistedSettings,
      merge: (persisted, current) => ({ ...current, ...sanitizeSettings(persisted) }),
      partialize: pickPersisted,
    },
  ),
);

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): "light" | "dark" {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

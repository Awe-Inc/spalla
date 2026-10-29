import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { Subdivision } from "@/audio/clickTrack";
import type { ClickSound } from "@/audio/metronome";

export type ThemePreference = "system" | "light" | "dark";
export type NoteNaming = "latin" | "letters";
export type Accent = "padrao" | "sepia";
export const STAFF_SCALES = [1, 1.25, 1.5] as const;
export type StaffScale = (typeof STAFF_SCALES)[number];
export const PLAY_VIEWS = ["pauta", "pistas", "ambos"] as const;
export type PlayView = (typeof PLAY_VIEWS)[number];

export interface PracticeAudioPrefs {
  metronomeOn: boolean;
  metronomeSubdivision: Subdivision;
  metronomeVolume: number;
  metronomeSound: ClickSound;
  droneVolume: number;
  listenVolume: number;
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
  accent: Accent;
  lessonWeekday: number | null;
  setLessonWeekday: (weekday: number | null) => void;
  setRoutine: (routineId: number) => void;
  completeOnboarding: () => void;
  setInputGain: (gain: number) => void;
  setStaffScale: (scale: StaffScale) => void;
  setPlayView: (view: PlayView) => void;
  setAccent: (accent: Accent) => void;
  setTheme: (theme: ThemePreference) => void;
  setNoteNaming: (naming: NoteNaming) => void;
  setInputDevice: (deviceId: string | null) => void;
  confirmHeadphones: () => void;
  setPracticeAudio: (prefs: Partial<PracticeAudioPrefs>) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "system",
      noteNaming: "latin",
      inputDeviceId: null,
      headphonesConfirmedAt: null,
      routineId: -25,
      onboardedAt: null,
      inputGain: 1,
      staffScale: 1,
      playView: "pauta",
      accent: "padrao",
      lessonWeekday: null,
      setLessonWeekday: (lessonWeekday) => set({ lessonWeekday }),
      setRoutine: (routineId) => set({ routineId }),
      completeOnboarding: () => set({ onboardedAt: Date.now() }),
      setInputGain: (inputGain) => set({ inputGain: Math.max(0.25, Math.min(4, inputGain)) }),
      setStaffScale: (staffScale) => set({ staffScale }),
      setPlayView: (playView) => set({ playView }),
      setAccent: (accent) => set({ accent }),
      metronomeOn: false,
      metronomeSubdivision: 1,
      metronomeVolume: 0.5,
      metronomeSound: "madeira",
      droneVolume: 0.35,
      listenVolume: 0.6,
      autoSlowdown: true,
      setTheme: (theme) => set({ theme }),
      setNoteNaming: (noteNaming) => set({ noteNaming }),
      setInputDevice: (inputDeviceId) => set({ inputDeviceId }),
      confirmHeadphones: () => set({ headphonesConfirmedAt: Date.now() }),
      setPracticeAudio: (prefs) => set(prefs),
    }),
    {
      name: "fretless-settings",
      partialize: ({ theme, noteNaming, inputDeviceId, routineId, onboardedAt, inputGain, staffScale, playView, accent, lessonWeekday, metronomeOn, metronomeSubdivision, metronomeVolume, metronomeSound, droneVolume, listenVolume, autoSlowdown }) => ({
        theme,
        lessonWeekday,
        noteNaming,
        inputDeviceId,
        routineId,
        onboardedAt,
        inputGain,
        staffScale,
        playView,
        accent,
        metronomeOn,
        metronomeSubdivision,
        metronomeVolume,
        metronomeSound,
        droneVolume,
        listenVolume,
        autoSlowdown,
      }),
    },
  ),
);

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): "light" | "dark" {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

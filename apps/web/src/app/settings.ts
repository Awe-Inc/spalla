import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { Subdivision } from "@/audio/clickTrack";
import type { ClickSound } from "@/audio/metronome";

export type ThemePreference = "system" | "light" | "dark";
export type NoteNaming = "latin" | "letters";

export interface PracticeAudioPrefs {
  metronomeOn: boolean;
  metronomeSubdivision: Subdivision;
  metronomeVolume: number;
  metronomeSound: ClickSound;
  droneVolume: number;
}

interface SettingsState extends PracticeAudioPrefs {
  theme: ThemePreference;
  noteNaming: NoteNaming;
  inputDeviceId: string | null;
  headphonesConfirmedAt: number | null;
  routineId: number;
  setRoutine: (routineId: number) => void;
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
      setRoutine: (routineId) => set({ routineId }),
      metronomeOn: false,
      metronomeSubdivision: 1,
      metronomeVolume: 0.5,
      metronomeSound: "madeira",
      droneVolume: 0.35,
      setTheme: (theme) => set({ theme }),
      setNoteNaming: (noteNaming) => set({ noteNaming }),
      setInputDevice: (inputDeviceId) => set({ inputDeviceId }),
      confirmHeadphones: () => set({ headphonesConfirmedAt: Date.now() }),
      setPracticeAudio: (prefs) => set(prefs),
    }),
    {
      name: "fretless-settings",
      partialize: ({ theme, noteNaming, inputDeviceId, routineId, metronomeOn, metronomeSubdivision, metronomeVolume, metronomeSound, droneVolume }) => ({
        theme,
        noteNaming,
        inputDeviceId,
        routineId,
        metronomeOn,
        metronomeSubdivision,
        metronomeVolume,
        metronomeSound,
        droneVolume,
      }),
    },
  ),
);

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): "light" | "dark" {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

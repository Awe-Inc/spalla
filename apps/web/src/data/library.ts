import type { Score } from "@fretless/core";
import { create } from "zustand";

export interface ImportedPiece {
  fileName: string;
  bytes: Uint8Array;
  score: Score;
  importedAt: number;
}

interface LibraryState {
  pieces: ImportedPiece[];
  selected: ImportedPiece | null;
  add: (piece: ImportedPiece) => void;
  select: (piece: ImportedPiece) => void;
  remove: (fileName: string) => void;
}

export const useLibrary = create<LibraryState>()((set) => ({
  pieces: [],
  selected: null,
  add: (piece) => set((state) => ({ pieces: [piece, ...state.pieces.filter((p) => p.fileName !== piece.fileName)] })),
  select: (piece) => set({ selected: piece }),
  remove: (fileName) =>
    set((state) => ({
      pieces: state.pieces.filter((p) => p.fileName !== fileName),
      selected: state.selected?.fileName === fileName ? null : state.selected,
    })),
}));

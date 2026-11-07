import type { PitchFrame } from "@fretless/core";

export const FRAMES_PER_POST = 2;

export class FrameBatch {
  #frames: PitchFrame[] = [];

  add(frame: PitchFrame): PitchFrame[] | null {
    this.#frames = [...this.#frames, frame];
    return this.#frames.length >= FRAMES_PER_POST ? this.flush() : null;
  }

  flush(): PitchFrame[] {
    const frames = this.#frames;
    this.#frames = [];
    return frames;
  }
}

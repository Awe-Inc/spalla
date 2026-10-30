import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Me } from "@/api/types";

import { syncPracticeInBackground, syncPracticeOnce } from "./practiceSync";
import { useAccount } from "./store";

const platform = vi.hoisted(() => ({ enabled: true, posts: 0 }));
const stored = vi.hoisted(() => [{ id: 1, exerciseId: "scales.1oct.69", playedAt: 0, accuracyPct: 91, meanSignedCents: -4, bpm: 72, stars: 2, durationSeconds: 40 }]);

vi.mock("@/api/client", () => ({
  isPlatformEnabled: () => platform.enabled,
  configureApiAuth: () => undefined,
  api: {
    post: async (_path: string, body: { results: unknown[] }) => {
      platform.posts += 1;
      await Promise.resolve();
      return { received: body.results.length, inserted: body.results.length };
    },
  },
}));

vi.mock("@/data/db", () => ({
  db: {
    results: {
      where: () => ({
        above: (cursor: number) => ({
          limit: () => ({ toArray: async () => stored.filter((result) => result.id > cursor) }),
        }),
      }),
    },
  },
}));

const STUDENT = { id: "aluno-1", permissions: ["lessons.read"] } as unknown as Me;

describe("syncPracticeInBackground", () => {
  beforeEach(() => {
    platform.enabled = true;
    platform.posts = 0;
    localStorage.clear();
  });

  afterEach(() => {
    useAccount.getState().clear();
  });

  it("does nothing without a signed-in student", async () => {
    expect(await syncPracticeInBackground()).toBeNull();
    useAccount.setState({ token: "t", user: { ...STUDENT, permissions: [] } as unknown as Me });
    expect(await syncPracticeInBackground()).toBeNull();
    expect(platform.posts).toBe(0);
  });

  it("does nothing when the platform is off", async () => {
    platform.enabled = false;
    useAccount.setState({ token: "t", user: STUDENT });
    expect(await syncPracticeInBackground()).toBeNull();
    expect(platform.posts).toBe(0);
  });

  it("sends the new runs once and then has nothing new", async () => {
    useAccount.setState({ token: "t", user: STUDENT });
    expect(await syncPracticeInBackground()).toEqual({ sent: 1, inserted: 1 });
    expect(await syncPracticeInBackground()).toEqual({ sent: 0, inserted: 0 });
    expect(platform.posts).toBe(1);
  });

  it("joins a sync already in flight instead of sending twice", async () => {
    const [first, second] = await Promise.all([syncPracticeOnce("aluno-1"), syncPracticeOnce("aluno-1")]);
    expect(first).toBe(second);
    expect(platform.posts).toBe(1);
  });
});

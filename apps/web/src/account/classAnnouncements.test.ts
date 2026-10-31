import { describe, expect, it } from "vitest";

import type { StudentAnnouncement } from "@/api/types";

import { announcementSentence, recentAnnouncements } from "./classAnnouncements";

const NOW = Date.parse("2026-10-31T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function announcement(id: string, daysAgo: number, body = `Aviso ${id}`): StudentAnnouncement {
  return { id, body, createdAt: new Date(NOW - daysAgo * DAY_MS).toISOString(), className: "Violino I", authorName: "Ana" };
}

describe("recentAnnouncements", () => {
  it("guarda só os avisos dos últimos 7 dias, o mais novo primeiro", () => {
    const recent = recentAnnouncements([announcement("velho", 8), announcement("a", 3), announcement("b", 1), announcement("limite", 7)], NOW);
    expect(recent.map((item) => item.id)).toEqual(["b", "a", "limite"]);
  });
});

describe("announcementSentence", () => {
  it("sem aviso recente não mostra nada", () => {
    expect(announcementSentence([])).toBeNull();
  });

  it("um aviso mostra a turma e a primeira linha", () => {
    expect(announcementSentence([announcement("a", 1, "Aula de quinta mudou para sexta.\nTragam o livro 2.")])).toBe("Aviso de Violino I: Aula de quinta mudou para sexta.");
  });

  it("corta a primeira linha longa", () => {
    const sentence = announcementSentence([announcement("a", 1, "x".repeat(200))]) ?? "";
    expect(sentence.endsWith("…")).toBe(true);
    expect(sentence.length).toBeLessThan(110);
  });

  it("vários avisos viram uma contagem", () => {
    expect(announcementSentence([announcement("a", 1), announcement("b", 2)])).toBe("2 avisos da turma");
  });
});

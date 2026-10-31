import type { StudentAnnouncement } from "@/api/types";

export const RECENT_ANNOUNCEMENT_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const PREVIEW_CHARS = 80;

export function recentAnnouncements<T extends StudentAnnouncement>(announcements: readonly T[], now: number): T[] {
  const since = now - RECENT_ANNOUNCEMENT_DAYS * DAY_MS;
  return announcements.filter((announcement) => Date.parse(announcement.createdAt) >= since).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function preview(body: string): string {
  const firstLine = body.trim().split("\n")[0]?.trim() ?? "";
  return firstLine.length > PREVIEW_CHARS ? `${firstLine.slice(0, PREVIEW_CHARS - 1).trimEnd()}…` : firstLine;
}

export function announcementSentence(recent: readonly StudentAnnouncement[]): string | null {
  const [latest] = recent;
  if (!latest) return null;
  if (recent.length > 1) return `${recent.length} avisos da turma`;
  return `Aviso de ${latest.className}: ${preview(latest.body)}`;
}

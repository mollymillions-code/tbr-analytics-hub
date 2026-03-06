import type { AnalysisDoc, ClassificationDoc, EventDoc, GridDoc } from "@/lib/types";

export type SessionType =
  | "practice"
  | "qualifying"
  | "race"
  | "raceoff"
  | "semifinal"
  | "placerace"
  | "final";

export interface EventSession {
  key: string;
  title: string;
  type: SessionType;
  classification: ClassificationDoc | null;
  analysis: AnalysisDoc | null;
  grid: GridDoc | null;
}

function scoreClassification(doc: ClassificationDoc | null): number {
  if (!doc) return -1;
  return (doc.results?.length ?? 0) * 100 + (doc.fastest_lap ? 10 : 0) + (doc.laps ?? 0);
}

function scoreAnalysis(doc: AnalysisDoc | null): number {
  if (!doc) return -1;
  return doc.teams?.length ?? 0;
}

function scoreGrid(doc: GridDoc | null): number {
  if (!doc) return -1;
  return doc.grid?.length ?? 0;
}

export function stripSessionMetadata(sessionName: string): string {
  return sessionName.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

export function normalizeSessionName(sessionName: string): string {
  return stripSessionMetadata(sessionName)
    .toLowerCase()
    .replace(/superfinal/g, "super final")
    .replace(/semifinal/g, "semi final")
    .replace(/play[- ]off/g, "race off")
    .replace(/\s+/g, " ")
    .trim();
}

export function getEventSessionName(sessionName: string | null | undefined, eventPath: string): string {
  return stripSessionMetadata(sessionName || eventPath.split("/").pop() || eventPath);
}

export function isHiddenSession(sessionName: string): boolean {
  const normalized = normalizeSessionName(sessionName);
  return normalized === "e1 series" || normalized.startsWith("merge ") || normalized.startsWith("combined ");
}

export function getSessionType(sessionName: string): SessionType {
  const normalized = normalizeSessionName(sessionName);

  if (normalized.includes("practice") || normalized.includes("morning") || normalized.includes("afternoon")) {
    return "practice";
  }

  if (
    normalized.includes("qualif") ||
    normalized.includes("time trial") ||
    normalized === "qp" ||
    normalized.startsWith("q1 ") ||
    normalized.startsWith("q2 ") ||
    normalized.startsWith("qp1 ") ||
    normalized.startsWith("qp2 ") ||
    normalized.startsWith("qrace")
  ) {
    return "qualifying";
  }

  if (normalized.includes("race off") || normalized.includes("eliminator")) {
    return "raceoff";
  }

  if (normalized.includes("semi")) {
    return "semifinal";
  }

  if (normalized.includes("place")) {
    return "placerace";
  }

  if (normalized.includes("final")) {
    return "final";
  }

  if (normalized.includes("group stage") || /^race \d/.test(normalized)) {
    return "race";
  }

  return "race";
}

export function isRaceLikeSession(sessionName: string): boolean {
  const type = getSessionType(sessionName);
  return type !== "practice" && type !== "qualifying";
}

function getSessionPriority(sessionName: string): number {
  const type = getSessionType(sessionName);

  switch (type) {
    case "practice":
      return 0;
    case "qualifying":
      return 1;
    case "race":
      return 2;
    case "raceoff":
      return 3;
    case "semifinal":
      return 4;
    case "placerace":
      return 5;
    case "final":
      return 6;
    default:
      return 99;
  }
}

export function parseSessionMetrics(sessionName: string): { laps: number | null; distance: string } {
  const match = sessionName.match(/\((\d+)\s+Laps?,\s*([^)]+?)\s*km\.?\)/i);
  if (!match) {
    return { laps: null, distance: "" };
  }

  return {
    laps: Number(match[1]),
    distance: match[2].trim(),
  };
}

export function collectEventSessions(events: Record<string, EventDoc[]>): EventSession[] {
  const sessions = new Map<string, EventSession>();

  for (const [eventPath, eventDocs] of Object.entries(events)) {
    for (const doc of eventDocs) {
      if (doc.type === "championship") continue;

      const title = getEventSessionName("session" in doc ? doc.session : undefined, eventPath);
      if (isHiddenSession(title)) continue;

      const key = normalizeSessionName(title);
      const existing = sessions.get(key) ?? {
        key,
        title,
        type: getSessionType(title),
        classification: null,
        analysis: null,
        grid: null,
      };

      if (doc.type === "classification" && scoreClassification(doc) > scoreClassification(existing.classification)) {
        existing.classification = doc;
      }

      if (doc.type === "analysis" && scoreAnalysis(doc) > scoreAnalysis(existing.analysis)) {
        existing.analysis = doc;
      }

      if (doc.type === "grid" && scoreGrid(doc) > scoreGrid(existing.grid)) {
        existing.grid = doc;
      }

      sessions.set(key, existing);
    }
  }

  return [...sessions.values()].sort((a, b) => {
    const priorityDelta = getSessionPriority(a.title) - getSessionPriority(b.title);
    if (priorityDelta !== 0) return priorityDelta;
    return a.title.localeCompare(b.title, undefined, { numeric: true });
  });
}

export function sortSeasons(seasons: string[]): string[] {
  return [...seasons].sort((a, b) => {
    const yearA = Number(a.match(/(\d{4})/)?.[1] ?? 0);
    const yearB = Number(b.match(/(\d{4})/)?.[1] ?? 0);
    if (yearA !== yearB) return yearA - yearB;

    const seasonA = Number(a.match(/Season (\d+)/)?.[1] ?? 0);
    const seasonB = Number(b.match(/Season (\d+)/)?.[1] ?? 0);
    return seasonA - seasonB;
  });
}

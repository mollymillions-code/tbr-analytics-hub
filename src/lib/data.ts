import { AllData, ClassificationDoc, AnalysisDoc, EventDoc } from "./types";

let cachedData: AllData | null = null;

export async function getAllData(): Promise<AllData> {
  if (cachedData) return cachedData;
  const res = await fetch("/data/e1_all_data.json");
  cachedData = await res.json();
  return cachedData!;
}

export function getClassifications(events: Record<string, EventDoc[]>): ClassificationDoc[] {
  const docs: ClassificationDoc[] = [];
  for (const eventDocs of Object.values(events)) {
    for (const doc of eventDocs) {
      if (doc.type === "classification" && (doc as ClassificationDoc).results?.length > 0) {
        docs.push(doc as ClassificationDoc);
      }
    }
  }
  return docs;
}

export function getAnalyses(events: Record<string, EventDoc[]>): AnalysisDoc[] {
  const docs: AnalysisDoc[] = [];
  for (const eventDocs of Object.values(events)) {
    for (const doc of eventDocs) {
      if (doc.type === "analysis") {
        docs.push(doc as AnalysisDoc);
      }
    }
  }
  return docs;
}

export function getRaceSessionTypes(events: Record<string, EventDoc[]>) {
  const sessions: { key: string; name: string; type: string }[] = [];
  const seen = new Set<string>();

  for (const [eventPath, eventDocs] of Object.entries(events)) {
    for (const doc of eventDocs) {
      if (doc.type === "classification" && (doc as ClassificationDoc).results?.length > 0) {
        const cls = doc as ClassificationDoc;
        const sessionName = cls.session || eventPath.split("/").pop() || eventPath;
        if (!seen.has(sessionName)) {
          seen.add(sessionName);
          let sessionType = "race";
          const lower = sessionName.toLowerCase();
          if (lower.includes("practice") || lower.includes("morning") || lower.includes("afternoon")) sessionType = "practice";
          else if (lower.includes("qualif") || lower.includes("time trial") || lower.includes("qrace") || lower.includes("q1") || lower.includes("q2")) sessionType = "qualifying";
          else if (lower.includes("semi")) sessionType = "semifinal";
          else if (lower.includes("final")) sessionType = "final";
          else if (lower.includes("place")) sessionType = "placerace";
          else if (lower.includes("race off") || lower.includes("race-off") || lower.includes("eliminator")) sessionType = "raceoff";

          sessions.push({ key: eventPath, name: sessionName, type: sessionType });
        }
      }
    }
  }
  return sessions;
}

const RACE_LOCATIONS: Record<string, { emoji: string; country: string }> = {
  "Jeddah": { emoji: "🇸🇦", country: "Saudi Arabia" },
  "Venice": { emoji: "🇮🇹", country: "Italy" },
  "Puerto Banús": { emoji: "🇪🇸", country: "Spain" },
  "Monaco": { emoji: "🇲🇨", country: "Monaco" },
  "Lake Como": { emoji: "🇮🇹", country: "Italy" },
  "Doha": { emoji: "🇶🇦", country: "Qatar" },
  "Dubrovnik": { emoji: "🇭🇷", country: "Croatia" },
  "Lago Maggiore": { emoji: "🇮🇹", country: "Italy" },
  "Lagos": { emoji: "🇵🇹", country: "Portugal" },
  "Miami": { emoji: "🇺🇸", country: "USA" },
};

export function getRaceInfo(raceName: string) {
  const location = raceName.replace(/^R\d+\s+/, "");
  return RACE_LOCATIONS[location] || { emoji: "🏁", country: "" };
}

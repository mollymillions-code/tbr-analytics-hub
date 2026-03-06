"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import {
  AllData,
  ClassificationDoc,
  AnalysisDoc,
  GridDoc,
  ChampionshipDoc,
  EventDoc,
  RaceResult,
  TeamAnalysis,
} from "@/lib/types";
import { getAllData, getRaceInfo, getRaceSessionTypes } from "@/lib/data";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";

// ─── Helpers ────────────────────────────────────────────────────────────────

function timeToSeconds(t: string | null): number | null {
  if (!t) return null;
  const parts = t.split(":");
  if (parts.length === 3) return +parts[0] * 3600 + +parts[1] * 60 + +parts[2];
  if (parts.length === 2) return +parts[0] * 60 + +parts[1];
  return +parts[0] || null;
}

function formatLapTime(t: string | null): string {
  if (!t) return "-";
  return t;
}

const TEAM_COLORS: Record<string, string> = {
  "team blue rising": "#0047FF",
  "team brady": "#ff0040",
  "team miami": "#ff8800",
  "team rafa": "#a855f7",
  "sergio perez": "#00ff88",
  "westbrook": "#00d4ff",
  "didier drogba": "#ffd700",
  "steve aoki": "#ff69b4",
  "will.i" : "#7fff00",
  "tom brady": "#ff0040",
};

function getTeamColor(team: string): string {
  const lower = team.toLowerCase();
  for (const [key, color] of Object.entries(TEAM_COLORS)) {
    if (lower.includes(key)) return color;
  }
  const hash = [...team].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 60%)`;
}

function isTBR(team: string): boolean {
  return team.toLowerCase().includes("blue rising");
}

// ─── Types ──────────────────────────────────────────────────────────────────

type SessionTab = {
  key: string;
  name: string;
  type: string;
  classification: ClassificationDoc | null;
  analysis: AnalysisDoc | null;
  grid: GridDoc | null;
};

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function RaceDashboard() {
  const params = useParams();
  const season = decodeURIComponent(params.season as string);
  const raceName = decodeURIComponent(params.raceName as string);

  const [data, setData] = useState<AllData | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  useEffect(() => {
    getAllData().then(setData);
  }, []);

  const raceData = useMemo(() => {
    if (!data) return null;
    return data.seasons[season]?.races[raceName] || null;
  }, [data, season, raceName]);

  const sessions = useMemo((): SessionTab[] => {
    if (!raceData) return [];
    const tabs: SessionTab[] = [];
    const seen = new Set<string>();

    for (const [eventPath, eventDocs] of Object.entries(raceData.events)) {
      for (const doc of eventDocs) {
        if (doc.type === "classification") {
          const cls = doc as ClassificationDoc;
          const sessionName = cls.session || eventPath.split("/").pop() || eventPath;
          if (seen.has(sessionName)) continue;
          seen.add(sessionName);

          // Skip merge/combined summary docs
          if (sessionName.toLowerCase().startsWith("merge ") || sessionName.toLowerCase().startsWith("combined ") || sessionName === "E1 Series") continue;

          let sessionType = "race";
          const lower = sessionName.toLowerCase();
          if (lower.includes("practice") || lower.includes("morning") || lower.includes("afternoon")) sessionType = "practice";
          else if (lower.includes("qualif") || lower.includes("time trial") || lower.includes("qrace") || lower.includes("q1") || lower.includes("q2") || lower === "qp") sessionType = "qualifying";
          else if (lower.includes("semi")) sessionType = "semifinal";
          else if (lower.includes("final")) sessionType = "final";
          else if (lower.includes("place")) sessionType = "placerace";
          else if (lower.includes("race off") || lower.includes("race-off") || lower.includes("eliminator")) sessionType = "raceoff";
          else if (lower.includes("group stage") || lower.includes("group a") || lower.includes("group b")) sessionType = "groupstage";

          // Find matching analysis and grid
          let analysis: AnalysisDoc | null = null;
          let grid: GridDoc | null = null;
          for (const docs2 of Object.values(raceData.events)) {
            for (const d of docs2) {
              if (d.type === "analysis" && (d as AnalysisDoc).session === cls.session) {
                analysis = d as AnalysisDoc;
              }
              if (d.type === "grid" && (d as GridDoc).session?.includes(sessionName)) {
                grid = d as GridDoc;
              }
            }
          }

          tabs.push({ key: eventPath, name: sessionName, type: sessionType, classification: cls, analysis, grid });
        }
      }
    }

    // Sort by session type priority
    const typeOrder: Record<string, number> = {
      practice: 0, qualifying: 1, groupstage: 2, raceoff: 3, semifinal: 4, placerace: 5, final: 6, race: 3,
    };
    tabs.sort((a, b) => (typeOrder[a.type] ?? 3) - (typeOrder[b.type] ?? 3));
    return tabs;
  }, [raceData]);

  const championship = useMemo((): ChampionshipDoc | null => {
    if (!raceData) return null;
    for (const docs of Object.values(raceData.events)) {
      for (const doc of docs) {
        if (doc.type === "championship" && (doc as ChampionshipDoc).standings?.length > 0) {
          return doc as ChampionshipDoc;
        }
      }
    }
    return null;
  }, [raceData]);

  useEffect(() => {
    if (sessions.length > 0 && !activeTab) {
      // Default to first final, or last session
      const finals = sessions.filter((s) => s.type === "final");
      setActiveTab(finals.length > 0 ? finals[0].name : sessions[sessions.length - 1].name);
    }
  }, [sessions, activeTab]);

  const activeSession = sessions.find((s) => s.name === activeTab) || null;
  const info = getRaceInfo(raceName);
  const roundNumber = raceName.match(/R(\d+)/)?.[1] || "?";
  const location = raceName.replace(/^R\d+\s+/, "");

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[var(--accent-cyan)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <div className="font-display text-sm tracking-wider text-[var(--text-muted)]">LOADING DATA</div>
        </div>
      </div>
    );
  }

  if (!raceData) {
    return (
      <div className="text-center py-20">
        <div className="font-display text-xl text-[var(--accent-red)] mb-2">RACE NOT FOUND</div>
        <p className="text-[var(--text-muted)]">No data for {season} / {raceName}</p>
        <a href="/" className="inline-block mt-4 text-[var(--accent-cyan)] hover:underline">&larr; Back to Seasons</a>
      </div>
    );
  }

  // ─── Session type badges ──────────────────────────────────────────────────
  const typeStyles: Record<string, string> = {
    practice: "bg-[rgba(136,136,136,0.15)] text-[#888] border-[#555]",
    qualifying: "bg-[rgba(168,85,247,0.15)] text-[var(--accent-purple)] border-[rgba(168,85,247,0.4)]",
    groupstage: "bg-[rgba(0,212,255,0.15)] text-[var(--accent-cyan)] border-[rgba(0,212,255,0.4)]",
    raceoff: "bg-[rgba(255,136,0,0.15)] text-[var(--accent-orange)] border-[rgba(255,136,0,0.4)]",
    semifinal: "bg-[rgba(0,255,136,0.15)] text-[var(--accent-green)] border-[rgba(0,255,136,0.4)]",
    placerace: "bg-[rgba(255,215,0,0.15)] text-[var(--accent-gold)] border-[rgba(255,215,0,0.4)]",
    final: "bg-[rgba(255,0,64,0.15)] text-[var(--accent-red)] border-[rgba(255,0,64,0.4)]",
    race: "bg-[rgba(0,212,255,0.15)] text-[var(--accent-cyan)] border-[rgba(0,212,255,0.4)]",
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <a href="/" className="text-xs text-[var(--text-muted)] hover:text-[var(--accent-cyan)] uppercase tracking-widest transition-colors">
          &larr; {season}
        </a>
        <div className="flex items-center gap-4 mt-2">
          <span className="text-4xl">{info.emoji}</span>
          <div>
            <div className="text-xs text-[var(--text-muted)] uppercase tracking-widest">Round {roundNumber}</div>
            <h1 className="font-display text-2xl md:text-3xl font-bold tracking-wider">{location.toUpperCase()}</h1>
            <div className="text-sm text-[var(--text-secondary)]">{info.country} &middot; {sessions.length} sessions</div>
          </div>
        </div>
      </div>

      {/* Session Tabs */}
      <div className="flex gap-2 flex-wrap mb-6 pb-4 border-b border-[var(--border-color)]">
        {sessions.map((s) => (
          <button
            key={s.name}
            onClick={() => setActiveTab(s.name)}
            className={`px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider border transition-all cursor-pointer ${
              activeTab === s.name
                ? "bg-[var(--accent-cyan)] border-[var(--accent-cyan)] text-black"
                : typeStyles[s.type] || typeStyles.race
            }`}
          >
            {s.name}
          </button>
        ))}
        {championship && (
          <button
            onClick={() => setActiveTab("__championship__")}
            className={`px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider border transition-all cursor-pointer ${
              activeTab === "__championship__"
                ? "bg-[var(--accent-gold)] border-[var(--accent-gold)] text-black"
                : "bg-[rgba(255,215,0,0.15)] text-[var(--accent-gold)] border-[rgba(255,215,0,0.4)]"
            }`}
          >
            Championship
          </button>
        )}
      </div>

      {/* Championship View */}
      {activeTab === "__championship__" && championship && (
        <ChampionshipView standings={championship.standings} />
      )}

      {/* Session Content */}
      {activeSession && (
        <SessionView session={activeSession} />
      )}
    </div>
  );
}

// ─── Championship View ──────────────────────────────────────────────────────

function ChampionshipView({ standings }: { standings: ChampionshipDoc["standings"] }) {
  const maxPts = Math.max(...standings.map((s) => s.points));
  return (
    <div>
      <h2 className="font-display text-lg font-bold tracking-wider text-[var(--accent-gold)] mb-4">CHAMPIONSHIP STANDINGS</h2>
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] overflow-hidden">
        <table className="w-full race-table">
          <thead>
            <tr className="border-b border-[var(--border-color)]">
              <th className="text-left px-4 py-3 text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold w-16">Pos</th>
              <th className="text-left px-4 py-3 text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold">Team</th>
              <th className="text-right px-4 py-3 text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold w-20">Points</th>
              <th className="px-4 py-3 text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold w-1/3"></th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s) => (
              <tr key={s.pos} className={`border-b border-[var(--border-color)]/30 ${isTBR(s.team) ? "bg-[rgba(0,71,255,0.1)]" : ""}`}>
                <td className="px-4 py-3">
                  <span className={`font-numbers font-bold text-lg ${s.pos <= 3 ? "text-[var(--accent-gold)]" : "text-[var(--text-secondary)]"}`}>
                    {s.pos}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`font-semibold ${isTBR(s.team) ? "text-[#0047FF]" : "text-white"}`}>{s.team}</span>
                </td>
                <td className="text-right px-4 py-3">
                  <span className="font-numbers font-bold text-lg">{s.points}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="h-2 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${(s.points / maxPts) * 100}%`,
                        backgroundColor: getTeamColor(s.team),
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Session View ───────────────────────────────────────────────────────────

function SessionView({ session }: { session: SessionTab }) {
  const { classification, analysis, grid } = session;
  const hasResults = classification && classification.results.length > 0;
  const hasAnalysis = analysis && analysis.teams.length > 0;
  const hasGrid = grid && grid.grid.length > 0;

  return (
    <div className="space-y-6">
      {/* Session Info Bar */}
      <div className="flex flex-wrap gap-4 items-center">
        {classification?.laps && (
          <InfoPill label="Laps" value={String(classification.laps)} color="cyan" />
        )}
        {classification?.distance && (
          <InfoPill label="Distance" value={`${classification.distance} km`} color="green" />
        )}
        {classification?.wind && (
          <InfoPill label="Wind" value={`${classification.wind} kts`} color="purple" />
        )}
        {classification?.date && (
          <InfoPill label="Date" value={classification.date} color="orange" />
        )}
        {classification?.fastest_lap && (
          <div className="bg-[rgba(255,0,64,0.1)] border border-[rgba(255,0,64,0.3)] rounded-lg px-4 py-2 flex items-center gap-3">
            <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Fastest Lap</span>
            <span className="font-numbers font-bold text-[var(--accent-red)]">{classification.fastest_lap.time}</span>
            <span className="text-xs text-[var(--text-secondary)]">{classification.fastest_lap.pilot}</span>
            <span className="text-xs text-[var(--text-muted)]">Lap {classification.fastest_lap.lap} &middot; {classification.fastest_lap.kph} km/h</span>
          </div>
        )}
      </div>

      {/* Results Table */}
      {hasResults && <ResultsTable results={classification!.results} grid={grid} />}

      {/* Grid (if no results but grid exists) */}
      {!hasResults && hasGrid && <GridView grid={grid!} />}

      {/* No results message */}
      {!hasResults && !hasGrid && classification && (
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] p-8 text-center">
          <div className="text-[var(--text-muted)] text-sm">
            Session metadata available but detailed results were not extracted from the PDF.
          </div>
          {classification.fastest_lap && (
            <div className="mt-4">
              <span className="text-xs text-[var(--text-muted)]">Fastest lap by </span>
              <span className="font-semibold text-white">{classification.fastest_lap.pilot}</span>
              <span className="text-xs text-[var(--text-muted)]"> — </span>
              <span className="font-numbers font-bold text-[var(--accent-red)]">{classification.fastest_lap.time}</span>
            </div>
          )}
        </div>
      )}

      {/* Lap Analysis */}
      {hasAnalysis && <LapAnalysis analysis={analysis!} />}

      {/* Position Gains (if results + grid both have data) */}
      {hasResults && hasGrid && <PositionGains results={classification!.results} grid={grid!} />}
    </div>
  );
}

// ─── Info Pill ──────────────────────────────────────────────────────────────

function InfoPill({ label, value, color }: { label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    cyan: "bg-[rgba(0,212,255,0.1)] border-[rgba(0,212,255,0.3)] text-[var(--accent-cyan)]",
    green: "bg-[rgba(0,255,136,0.1)] border-[rgba(0,255,136,0.3)] text-[var(--accent-green)]",
    purple: "bg-[rgba(168,85,247,0.1)] border-[rgba(168,85,247,0.3)] text-[var(--accent-purple)]",
    orange: "bg-[rgba(255,136,0,0.1)] border-[rgba(255,136,0,0.3)] text-[var(--accent-orange)]",
    red: "bg-[rgba(255,0,64,0.1)] border-[rgba(255,0,64,0.3)] text-[var(--accent-red)]",
  };
  return (
    <div className={`rounded-lg px-3 py-2 border ${colors[color] || colors.cyan}`}>
      <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mr-2">{label}</span>
      <span className="font-numbers font-bold text-sm">{value}</span>
    </div>
  );
}

// ─── Results Table ──────────────────────────────────────────────────────────

function ResultsTable({ results, grid }: { results: RaceResult[]; grid: GridDoc | null }) {
  // Build grid lookup for position change
  const gridMap = new Map<string, number>();
  if (grid?.grid) {
    for (const g of grid.grid) {
      gridMap.set(g.no, g.pos);
    }
  }

  return (
    <div>
      <h3 className="font-display text-sm font-bold tracking-wider text-[var(--accent-cyan)] mb-3 uppercase">Classification</h3>
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] overflow-x-auto">
        <table className="w-full race-table text-sm">
          <thead>
            <tr className="border-b border-[var(--border-color)]">
              <th className="text-left px-3 py-3 text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold w-12">Pos</th>
              <th className="text-left px-3 py-3 text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold w-12">No</th>
              <th className="text-left px-3 py-3 text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">Pilot</th>
              <th className="text-left px-3 py-3 text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">Team</th>
              <th className="text-right px-3 py-3 text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold w-16">Laps</th>
              <th className="text-right px-3 py-3 text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">Time</th>
              <th className="text-right px-3 py-3 text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">Gap</th>
              <th className="text-right px-3 py-3 text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold w-16">km/h</th>
              <th className="text-right px-3 py-3 text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">Best Lap</th>
              {gridMap.size > 0 && (
                <th className="text-center px-3 py-3 text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold w-16">+/-</th>
              )}
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => {
              const gridPos = gridMap.get(r.no);
              const posNum = typeof r.pos === "number" ? r.pos : null;
              const gained = gridPos && posNum ? gridPos - posNum : null;
              const tbr = isTBR(r.team);

              return (
                <tr key={i} className={`border-b border-[var(--border-color)]/20 ${tbr ? "bg-[rgba(0,71,255,0.08)]" : ""}`}>
                  <td className="px-3 py-2.5">
                    <span className={`font-numbers font-bold ${
                      posNum === 1 ? "text-[var(--accent-gold)]" :
                      posNum === 2 ? "text-[#C0C0C0]" :
                      posNum === 3 ? "text-[#CD7F32]" :
                      typeof r.pos === "string" ? "text-[var(--accent-red)]" :
                      "text-white"
                    }`}>
                      {typeof r.pos === "string" ? r.pos : `P${r.pos}`}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-numbers text-[var(--text-secondary)]">{r.no}</td>
                  <td className="px-3 py-2.5 font-semibold">{r.pilot}</td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getTeamColor(r.team) }} />
                      <span className={`text-xs ${tbr ? "text-[#4488ff] font-bold" : "text-[var(--text-secondary)]"}`}>{r.team}</span>
                    </span>
                  </td>
                  <td className="text-right px-3 py-2.5 font-numbers text-[var(--text-secondary)]">{r.laps}</td>
                  <td className="text-right px-3 py-2.5 font-numbers">{r.total_time || "-"}</td>
                  <td className="text-right px-3 py-2.5 font-numbers text-[var(--text-muted)]">{r.gap || "-"}</td>
                  <td className="text-right px-3 py-2.5 font-numbers text-[var(--text-secondary)]">{r.kph || "-"}</td>
                  <td className="text-right px-3 py-2.5">
                    {r.best_lap ? (
                      <span className="font-numbers">
                        <span className="text-[var(--accent-cyan)]">{r.best_lap.time}</span>
                        <span className="text-[var(--text-muted)] text-[10px] ml-1">L{r.best_lap.lap}</span>
                      </span>
                    ) : "-"}
                  </td>
                  {gridMap.size > 0 && (
                    <td className="text-center px-3 py-2.5">
                      {gained !== null ? (
                        <span className={`font-numbers font-bold text-xs px-2 py-0.5 rounded ${
                          gained > 0 ? "bg-[rgba(0,255,136,0.15)] text-[var(--accent-green)]" :
                          gained < 0 ? "bg-[rgba(255,0,64,0.15)] text-[var(--accent-red)]" :
                          "text-[var(--text-muted)]"
                        }`}>
                          {gained > 0 ? `+${gained}` : gained === 0 ? "=" : String(gained)}
                        </span>
                      ) : "-"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Grid View ──────────────────────────────────────────────────────────────

function GridView({ grid }: { grid: GridDoc }) {
  return (
    <div>
      <h3 className="font-display text-sm font-bold tracking-wider text-[var(--accent-green)] mb-3 uppercase">Starting Grid</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {grid.grid.map((g) => (
          <div
            key={g.pos}
            className={`bg-[var(--bg-card)] border rounded-lg p-3 text-center ${
              isTBR(g.team) ? "border-[#0047FF] bg-[rgba(0,71,255,0.1)]" : "border-[var(--border-color)]"
            }`}
          >
            <div className="font-numbers text-2xl font-bold text-[var(--text-muted)]">P{g.pos}</div>
            <div className="font-semibold text-sm mt-1 truncate">{g.pilot}</div>
            <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mt-0.5 truncate">{g.team}</div>
            <div className="text-xs text-[var(--text-secondary)] mt-0.5">#{g.no}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Lap Analysis ───────────────────────────────────────────────────────────

function LapAnalysis({ analysis }: { analysis: AnalysisDoc }) {
  const [chartType, setChartType] = useState<"lapTimes" | "sectors">("lapTimes");
  const teams = analysis.teams;

  if (teams.length === 0) return null;

  // Build lap time chart data
  const maxLaps = Math.max(...teams.map((t) => t.laps.length));
  const lapTimeData = [];
  for (let i = 0; i < maxLaps; i++) {
    const point: Record<string, number | string> = { lap: i + 1 };
    for (const team of teams) {
      if (team.laps[i]) {
        const sec = timeToSeconds(team.laps[i].time);
        if (sec !== null) {
          point[team.team] = Math.round(sec * 1000) / 1000;
        }
      }
    }
    lapTimeData.push(point);
  }

  // Sector comparison data
  const sectorData = teams
    .filter((t) => t.laps.some((l) => l.sector1 !== null))
    .map((t) => {
      const validLaps = t.laps.filter((l) => l.sector1 !== null && l.sector2 !== null && l.sector3 !== null);
      if (validLaps.length === 0) return null;
      const bestS1 = Math.min(...validLaps.map((l) => l.sector1!));
      const bestS2 = Math.min(...validLaps.map((l) => l.sector2!));
      const bestS3 = Math.min(...validLaps.map((l) => l.sector3!));
      return { team: t.team.length > 20 ? t.team.slice(0, 18) + ".." : t.team, S1: bestS1, S2: bestS2, S3: bestS3 };
    })
    .filter(Boolean);

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h3 className="font-display text-sm font-bold tracking-wider text-[var(--accent-purple)] uppercase">Lap Analysis</h3>
        <div className="flex gap-1">
          <button
            onClick={() => setChartType("lapTimes")}
            className={`px-3 py-1 rounded text-[10px] font-semibold uppercase tracking-wider cursor-pointer transition-all ${
              chartType === "lapTimes" ? "bg-[var(--accent-purple)] text-black" : "bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border-color)]"
            }`}
          >
            Lap Times
          </button>
          {sectorData.length > 0 && (
            <button
              onClick={() => setChartType("sectors")}
              className={`px-3 py-1 rounded text-[10px] font-semibold uppercase tracking-wider cursor-pointer transition-all ${
                chartType === "sectors" ? "bg-[var(--accent-purple)] text-black" : "bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border-color)]"
              }`}
            >
              Sectors
            </button>
          )}
        </div>
      </div>

      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] p-4">
        {chartType === "lapTimes" && lapTimeData.length > 0 && (
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={lapTimeData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="lap" stroke="#666" tick={{ fill: "#888", fontSize: 11 }} label={{ value: "Lap", position: "insideBottom", offset: -5, fill: "#666" }} />
              <YAxis stroke="#666" tick={{ fill: "#888", fontSize: 11 }} domain={["auto", "auto"]} label={{ value: "Time (s)", angle: -90, position: "insideLeft", fill: "#666" }} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1e1e35", border: "1px solid #333", borderRadius: "8px", fontSize: "12px" }}
                labelStyle={{ color: "#888" }}
              />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              {teams.map((team) => (
                <Line
                  key={team.team}
                  type="monotone"
                  dataKey={team.team}
                  stroke={getTeamColor(team.team)}
                  strokeWidth={isTBR(team.team) ? 3 : 1.5}
                  dot={{ r: isTBR(team.team) ? 4 : 2 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}

        {chartType === "sectors" && sectorData.length > 0 && (
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={sectorData} margin={{ top: 10, right: 30, left: 10, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="team" stroke="#666" tick={{ fill: "#888", fontSize: 10 }} interval={0} />
              <YAxis stroke="#666" tick={{ fill: "#888", fontSize: 11 }} label={{ value: "Time (s)", angle: -90, position: "insideLeft", fill: "#666" }} />
              <Tooltip contentStyle={{ backgroundColor: "#1e1e35", border: "1px solid #333", borderRadius: "8px", fontSize: "12px" }} />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              <Bar dataKey="S1" fill="#00d4ff" name="Sector 1" />
              <Bar dataKey="S2" fill="#00ff88" name="Sector 2" />
              <Bar dataKey="S3" fill="#a855f7" name="Sector 3" />
            </BarChart>
          </ResponsiveContainer>
        )}

        {/* Lap Detail Table */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full race-table text-xs">
            <thead>
              <tr className="border-b border-[var(--border-color)]">
                <th className="text-left px-2 py-2 text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Team</th>
                <th className="text-left px-2 py-2 text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Pilot(s)</th>
                <th className="text-right px-2 py-2 text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Laps</th>
                <th className="text-right px-2 py-2 text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Best Lap</th>
                <th className="text-right px-2 py-2 text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Best S1</th>
                <th className="text-right px-2 py-2 text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Best S2</th>
                <th className="text-right px-2 py-2 text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Best S3</th>
                <th className="text-center px-2 py-2 text-[10px] text-[var(--text-muted)] uppercase tracking-wider">SL/LL</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => {
                const bestLap = t.laps.length > 0 ? t.laps.reduce((best, l) => {
                  const cur = timeToSeconds(l.time);
                  const prev = timeToSeconds(best.time);
                  return cur !== null && (prev === null || cur < prev) ? l : best;
                }) : null;
                const validSectorLaps = t.laps.filter((l) => l.sector1 !== null);
                const bestS1 = validSectorLaps.length > 0 ? Math.min(...validSectorLaps.map((l) => l.sector1!)) : null;
                const bestS2 = validSectorLaps.length > 0 ? Math.min(...validSectorLaps.filter((l) => l.sector2 !== null).map((l) => l.sector2!)) : null;
                const bestS3 = validSectorLaps.length > 0 ? Math.min(...validSectorLaps.filter((l) => l.sector3 !== null).map((l) => l.sector3!)) : null;
                const slCount = t.laps.filter((l) => l.marker === "SL").length;
                const llCount = t.laps.filter((l) => l.marker === "LL").length;
                const tbr = isTBR(t.team);

                return (
                  <tr key={t.team} className={`border-b border-[var(--border-color)]/20 ${tbr ? "bg-[rgba(0,71,255,0.08)]" : ""}`}>
                    <td className="px-2 py-2">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getTeamColor(t.team) }} />
                        <span className={`${tbr ? "text-[#4488ff] font-bold" : ""}`}>{t.team}</span>
                      </span>
                    </td>
                    <td className="px-2 py-2 text-[var(--text-secondary)]">{t.pilots.join(", ")}</td>
                    <td className="text-right px-2 py-2 font-numbers">{t.laps.length}</td>
                    <td className="text-right px-2 py-2 font-numbers text-[var(--accent-cyan)]">{bestLap ? bestLap.time : "-"}</td>
                    <td className="text-right px-2 py-2 font-numbers">{bestS1?.toFixed(3) || "-"}</td>
                    <td className="text-right px-2 py-2 font-numbers">{bestS2?.toFixed(3) || "-"}</td>
                    <td className="text-right px-2 py-2 font-numbers">{bestS3?.toFixed(3) || "-"}</td>
                    <td className="text-center px-2 py-2">
                      {slCount > 0 && <span className="text-[var(--accent-orange)] mr-1">SL:{slCount}</span>}
                      {llCount > 0 && <span className="text-[var(--accent-red)]">LL:{llCount}</span>}
                      {slCount === 0 && llCount === 0 && <span className="text-[var(--text-muted)]">-</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Position Gains ─────────────────────────────────────────────────────────

function PositionGains({ results, grid }: { results: RaceResult[]; grid: GridDoc }) {
  const gridMap = new Map<string, number>();
  for (const g of grid.grid) {
    gridMap.set(g.no, g.pos);
  }

  const gains = results
    .filter((r) => typeof r.pos === "number" && gridMap.has(r.no))
    .map((r) => ({
      pilot: r.pilot,
      team: r.team,
      start: gridMap.get(r.no)!,
      finish: r.pos as number,
      gained: gridMap.get(r.no)! - (r.pos as number),
    }))
    .sort((a, b) => b.gained - a.gained);

  if (gains.length === 0) return null;

  return (
    <div>
      <h3 className="font-display text-sm font-bold tracking-wider text-[var(--accent-green)] mb-3 uppercase">Position Changes</h3>
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] p-4">
        <ResponsiveContainer width="100%" height={Math.max(200, gains.length * 40)}>
          <BarChart data={gains} layout="vertical" margin={{ top: 5, right: 30, left: 120, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
            <XAxis type="number" stroke="#666" tick={{ fill: "#888", fontSize: 11 }} />
            <YAxis type="category" dataKey="pilot" stroke="#666" tick={{ fill: "#ccc", fontSize: 11 }} width={110} />
            <Tooltip
              contentStyle={{ backgroundColor: "#1e1e35", border: "1px solid #333", borderRadius: "8px", fontSize: "12px" }}
              formatter={(value) => [`${Number(value) > 0 ? "+" : ""}${value} positions`, "Gained"]}
            />
            <Bar dataKey="gained" radius={[0, 4, 4, 0]}>
              {gains.map((g, i) => (
                <Cell key={i} fill={g.gained > 0 ? "#00ff88" : g.gained < 0 ? "#ff0040" : "#666"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

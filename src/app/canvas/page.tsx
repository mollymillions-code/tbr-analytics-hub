"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  AllData,
  ClassificationDoc,
  AnalysisDoc,
  ChampionshipDoc,
} from "@/lib/types";
import { getAllData } from "@/lib/data";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie,
} from "recharts";
import { Search, Sparkles, ChevronRight, X } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AnalysisBlock {
  type: "text" | "chart" | "table" | "stat-grid" | "heading";
  content?: string;
  chartType?: "bar" | "line" | "pie";
  chartData?: Record<string, unknown>[];
  chartConfig?: {
    xKey: string;
    yKeys: { key: string; color: string; name: string }[];
    height?: number;
  };
  tableData?: { headers: string[]; rows: string[][] };
  stats?: { label: string; value: string; color: string; sub?: string }[];
}

interface CanvasResult {
  title: string;
  blocks: AnalysisBlock[];
}

interface ClassificationEntry {
  season: string;
  race: string;
  doc: ClassificationDoc;
}

interface AnalysisEntry {
  season: string;
  race: string;
  doc: AnalysisDoc;
}

interface ChampionshipEntry {
  season: string;
  race: string;
  doc: ChampionshipDoc;
}

interface FastestLapEntry {
  season: string;
  race: string;
  session: string;
  pilot: string;
  time: string;
  kph: number;
  lap: number;
  team: string | null;
}

interface AnalysisContext {
  data: AllData;
  allCls: ClassificationEntry[];
  allAn: AnalysisEntry[];
  allChamp: ChampionshipEntry[];
  fastestLaps: FastestLapEntry[];
}

// ─── Data Helpers ───────────────────────────────────────────────────────────

function getAllClassifications(data: AllData) {
  const results: ClassificationEntry[] = [];
  for (const [season, sData] of Object.entries(data.seasons)) {
    for (const [race, rData] of Object.entries(sData.races)) {
      for (const docs of Object.values(rData.events)) {
        for (const doc of docs) {
          if (doc.type === "classification") {
            results.push({ season, race, doc: doc as ClassificationDoc });
          }
        }
      }
    }
  }
  return results;
}

function getAllAnalyses(data: AllData) {
  const results: AnalysisEntry[] = [];
  for (const [season, sData] of Object.entries(data.seasons)) {
    for (const [race, rData] of Object.entries(sData.races)) {
      for (const docs of Object.values(rData.events)) {
        for (const doc of docs) {
          if (doc.type === "analysis" && (doc as AnalysisDoc).teams?.length > 0) {
            results.push({ season, race, doc: doc as AnalysisDoc });
          }
        }
      }
    }
  }
  return results;
}

function getAllChampionships(data: AllData) {
  const results: ChampionshipEntry[] = [];
  for (const [season, sData] of Object.entries(data.seasons)) {
    for (const [race, rData] of Object.entries(sData.races)) {
      for (const docs of Object.values(rData.events)) {
        for (const doc of docs) {
          if (doc.type === "championship" && (doc as ChampionshipDoc).standings?.length > 0) {
            results.push({ season, race, doc: doc as ChampionshipDoc });
          }
        }
      }
    }
  }
  return results;
}

function timeToSeconds(t: string | null): number | null {
  if (!t) return null;
  const parts = t.split(":");
  if (parts.length === 3) return +parts[0] * 3600 + +parts[1] * 60 + +parts[2];
  if (parts.length === 2) return +parts[0] * 60 + +parts[1];
  return +parts[0] || null;
}

function sortSeasonRaceEntries<T extends { season: string; race: string }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    const seasonYearA = Number(a.season.match(/(\d{4})/)?.[1] ?? 0);
    const seasonYearB = Number(b.season.match(/(\d{4})/)?.[1] ?? 0);
    if (seasonYearA !== seasonYearB) return seasonYearA - seasonYearB;

    const seasonNumberA = Number(a.season.match(/Season (\d+)/)?.[1] ?? 0);
    const seasonNumberB = Number(b.season.match(/Season (\d+)/)?.[1] ?? 0);
    if (seasonNumberA !== seasonNumberB) return seasonNumberA - seasonNumberB;

    const raceNumberA = Number(a.race.match(/R(\d+)/)?.[1] ?? 0);
    const raceNumberB = Number(b.race.match(/R(\d+)/)?.[1] ?? 0);
    return raceNumberA - raceNumberB;
  });
}

function getTeamFilterName(teamFilter?: string): string | null {
  if (!teamFilter) return null;
  return teamFilter === "tbr" ? "blue rising" : teamFilter;
}

function getFastestLapEntries(allCls: ClassificationEntry[]): FastestLapEntry[] {
  const fastestLaps: FastestLapEntry[] = [];

  for (const { season, race, doc } of allCls) {
    if (!doc.fastest_lap?.pilot) continue;

    const matchingResult = doc.results.find((result) => result.pilot === doc.fastest_lap?.pilot);
    fastestLaps.push({
      season,
      race,
      session: doc.session,
      pilot: doc.fastest_lap.pilot,
      time: doc.fastest_lap.time,
      kph: doc.fastest_lap.kph,
      lap: doc.fastest_lap.lap,
      team: matchingResult?.team ?? null,
    });
  }

  return fastestLaps;
}

function buildAnalysisContext(data: AllData): AnalysisContext {
  const allCls = sortSeasonRaceEntries(getAllClassifications(data));
  const allAn = sortSeasonRaceEntries(getAllAnalyses(data));
  const allChamp = sortSeasonRaceEntries(getAllChampionships(data));

  return {
    data,
    allCls,
    allAn,
    allChamp,
    fastestLaps: getFastestLapEntries(allCls),
  };
}

// ─── Analysis Engine ────────────────────────────────────────────────────────

function analyzeQuery(query: string, context: AnalysisContext): CanvasResult {
  const q = query.toLowerCase();
  const { data, allCls, allAn, allChamp, fastestLaps } = context;

  // Detect team/pilot names
  const teamKeywords = [
    "blue rising", "tbr", "brady", "miami", "rafa", "perez", "westbrook",
    "drogba", "aoki", "alula", "lebron", "monaco", "sierra",
  ];
  const matchedTeam = teamKeywords.find((t) => q.includes(t));

  // Detect query type
  const isAboutFastestLaps = q.includes("fastest") || q.includes("best lap") || q.includes("speed");
  const isAboutMistakes = q.includes("mistake") || q.includes("error") || q.includes("penalty") || q.includes("dnf") || q.includes("long lap") || q.includes("short lap");
  const isAboutChampionship = q.includes("championship") || q.includes("standing") || q.includes("points");
  const isAboutComparison = q.includes("compar") || q.includes("vs") || q.includes("versus") || q.includes("against");
  const isAboutSectors = q.includes("sector") || q.includes("s1") || q.includes("s2") || q.includes("s3");
  const isAboutOverview = q.includes("overview") || q.includes("summary") || q.includes("how") || q.includes("performance") || q.includes("season");
  const isAboutPilot = q.includes("pilot") || q.includes("driver");

  // Route to specific analysis
  if (isAboutChampionship) return analyzeChampionship(allChamp, matchedTeam);
  if (isAboutMistakes && matchedTeam) return analyzeMistakes(allAn, allCls, matchedTeam);
  if (isAboutFastestLaps) return analyzeFastestLaps(allAn, fastestLaps, matchedTeam);
  if (isAboutSectors) return analyzeSectors(allAn, matchedTeam);
  if (matchedTeam) return analyzeTeam(allCls, allAn, allChamp, matchedTeam);
  if (isAboutOverview || isAboutComparison) return analyzeOverview(data, allCls, allAn, allChamp);
  if (isAboutPilot) return analyzePilots(data, allCls, allAn);

  // Default: overview
  return analyzeOverview(data, allCls, allAn, allChamp);
}

function analyzeChampionship(
  allChamp: ChampionshipEntry[],
  teamFilter?: string
): CanvasResult {
  const blocks: AnalysisBlock[] = [];

  // Get latest championship per season
  const seasonLatest = new Map<string, { race: string; doc: ChampionshipDoc }>();
  for (const c of allChamp) {
    seasonLatest.set(c.season, { race: c.race, doc: c.doc });
  }

  blocks.push({ type: "heading", content: "Championship Analysis" });

  for (const [season, { race, doc }] of seasonLatest) {
    blocks.push({ type: "text", content: `**${season}** — Standings after ${race}` });

    const chartData = doc.standings.map((s) => ({ team: s.team.length > 15 ? s.team.slice(0, 13) + ".." : s.team, points: s.points }));
    blocks.push({
      type: "chart",
      chartType: "bar",
      chartData,
      chartConfig: {
        xKey: "team",
        yKeys: [{ key: "points", color: "#00d4ff", name: "Points" }],
        height: 300,
      },
    });

    blocks.push({
      type: "table",
      tableData: {
        headers: ["Pos", "Team", "Points"],
        rows: doc.standings.map((s) => [String(s.pos), s.team, String(s.points)]),
      },
    });

    if (teamFilter) {
      const filterName = getTeamFilterName(teamFilter)!;
      const tbrStanding = doc.standings.find((s) => s.team.toLowerCase().includes(filterName));
      if (tbrStanding) {
        const leader = doc.standings[0];
        blocks.push({
          type: "stat-grid",
          stats: [
            { label: "Position", value: `P${tbrStanding.pos}`, color: "#00d4ff" },
            { label: "Points", value: String(tbrStanding.points), color: "#00ff88" },
            { label: "Gap to Leader", value: `${leader.points - tbrStanding.points} pts`, color: "#ff0040" },
            { label: "Leader", value: leader.team, color: "#ffd700" },
          ],
        });
      }
    }
  }

  return { title: "Championship Standings", blocks };
}

function analyzeMistakes(
  allAn: AnalysisEntry[],
  allCls: ClassificationEntry[],
  teamFilter: string
): CanvasResult {
  const blocks: AnalysisBlock[] = [];
  const filterName = getTeamFilterName(teamFilter)!;

  blocks.push({ type: "heading", content: `Mistake & Penalty Analysis` });

  // Count SL/LL from analysis data
  let totalSL = 0, totalLL = 0, totalLaps = 0;
  const sessionBreakdown: { session: string; race: string; sl: number; ll: number; laps: number }[] = [];

  for (const { race, doc } of allAn) {
    for (const team of doc.teams) {
      if (team.team.toLowerCase().includes(filterName)) {
        const sl = team.laps.filter((l) => l.marker === "SL").length;
        const ll = team.laps.filter((l) => l.marker === "LL").length;
        totalSL += sl;
        totalLL += ll;
        totalLaps += team.laps.length;
        if (sl > 0 || ll > 0) {
          sessionBreakdown.push({ session: doc.session, race, sl, ll, laps: team.laps.length });
        }
      }
    }
  }

  // DNFs from classification data
  let dnfCount = 0;
  const dnfSessions: string[] = [];
  for (const { race, doc } of allCls) {
    for (const r of doc.results) {
      if (r.team?.toLowerCase().includes(filterName) && typeof r.pos === "string") {
        dnfCount++;
        dnfSessions.push(`${race} - ${doc.session}`);
      }
    }
  }

  blocks.push({
    type: "stat-grid",
    stats: [
      { label: "Short Laps (SL)", value: String(totalSL), color: "#ff8800", sub: "Cutting corners / track limits" },
      { label: "Long Laps (LL)", value: String(totalLL), color: "#ff0040", sub: "Penalties / off-course" },
      { label: "Total Laps Analyzed", value: String(totalLaps), color: "#00d4ff" },
      { label: "DNFs / Non-Finishes", value: String(dnfCount), color: "#a855f7" },
    ],
  });

  if (totalLaps > 0) {
    const slRate = ((totalSL / totalLaps) * 100).toFixed(1);
    const llRate = ((totalLL / totalLaps) * 100).toFixed(1);
    blocks.push({
      type: "text",
      content: `Out of **${totalLaps}** laps analyzed, **${slRate}%** had short lap markers and **${llRate}%** had long lap penalties. ${
        totalLL > totalSL
          ? "The team has more long laps than short laps, suggesting they tend to overshoot corners or receive penalties rather than cutting track."
          : totalSL > totalLL
          ? "More short laps than long laps suggests aggressive driving that occasionally clips track limits."
          : "Short and long laps are balanced, indicating no dominant pattern of mistakes."
      }`,
    });
  }

  if (sessionBreakdown.length > 0) {
    blocks.push({
      type: "chart",
      chartType: "bar",
      chartData: sessionBreakdown.map((s) => ({
        session: s.session.length > 20 ? s.session.slice(0, 18) + ".." : s.session,
        SL: s.sl,
        LL: s.ll,
      })),
      chartConfig: {
        xKey: "session",
        yKeys: [
          { key: "SL", color: "#ff8800", name: "Short Laps" },
          { key: "LL", color: "#ff0040", name: "Long Laps" },
        ],
        height: 300,
      },
    });
  }

  if (dnfSessions.length > 0) {
    blocks.push({ type: "text", content: `**DNF / Non-Classified sessions:** ${dnfSessions.join(", ")}` });
  }

  if (totalLaps === 0 && dnfCount === 0) {
    blocks.push({ type: "text", content: "No detailed lap analysis data or DNFs found for this team in the current dataset. This may be due to limited data extraction from older season PDFs." });
  }

  return { title: `Mistakes & Penalties`, blocks };
}

function analyzeFastestLaps(
  allAn: AnalysisEntry[],
  fastestLaps: FastestLapEntry[],
  teamFilter?: string
): CanvasResult {
  const blocks: AnalysisBlock[] = [];
  blocks.push({ type: "heading", content: "Fastest Lap Analysis" });

  // Count fastest laps by pilot
  const pilotCounts = new Map<string, number>();
  for (const fl of fastestLaps) {
    pilotCounts.set(fl.pilot, (pilotCounts.get(fl.pilot) || 0) + 1);
  }
  const topPilots = [...pilotCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  blocks.push({
    type: "chart",
    chartType: "bar",
    chartData: topPilots.map(([pilot, count]) => ({ pilot, count })),
    chartConfig: {
      xKey: "pilot",
      yKeys: [{ key: "count", color: "#ff0040", name: "Fastest Laps" }],
      height: 300,
    },
  });

  blocks.push({
    type: "table",
    tableData: {
      headers: ["Pilot", "Fastest Laps Set"],
      rows: topPilots.map(([pilot, count]) => [pilot, String(count)]),
    },
  });

  // Best lap times by team from analysis data
  if (allAn.length > 0) {
    const teamBestLaps = new Map<string, { time: number; timeStr: string; session: string }>();
    for (const { doc } of allAn) {
      for (const team of doc.teams) {
        for (const lap of team.laps) {
          const sec = timeToSeconds(lap.time);
          if (sec !== null) {
            const existing = teamBestLaps.get(team.team);
            if (!existing || sec < existing.time) {
              teamBestLaps.set(team.team, { time: sec, timeStr: lap.time, session: doc.session });
            }
          }
        }
      }
    }

    if (teamBestLaps.size > 0) {
      const sorted = [...teamBestLaps.entries()].sort((a, b) => a[1].time - b[1].time);
      blocks.push({ type: "text", content: "**Best Lap Times by Team** (from lap analysis data):" });
      blocks.push({
        type: "table",
        tableData: {
          headers: ["Team", "Best Lap", "Time (s)", "Session"],
          rows: sorted.map(([team, d]) => [team, d.timeStr, d.time.toFixed(3), d.session]),
        },
      });
    }
  }

  if (teamFilter) {
    const filterName = getTeamFilterName(teamFilter)!;
    const teamFLs = fastestLaps.filter((fastestLap) => fastestLap.team?.toLowerCase().includes(filterName));
    if (teamFLs.length > 0) {
      const bestLap = [...teamFLs].sort(
        (a, b) => (timeToSeconds(a.time) ?? Number.POSITIVE_INFINITY) - (timeToSeconds(b.time) ?? Number.POSITIVE_INFINITY)
      )[0];
      blocks.push({
        type: "text",
        content: `**${teamFilter.toUpperCase()}** has set **${teamFLs.length}** fastest laps across sessions${bestLap ? `, with a best of **${bestLap.time}** in **${bestLap.race} ${bestLap.session}**.` : "."}`,
      });
    }
  }

  return { title: "Fastest Lap Analysis", blocks };
}

function analyzeSectors(
  allAn: AnalysisEntry[],
  teamFilter?: string
): CanvasResult {
  const blocks: AnalysisBlock[] = [];
  const filterName = getTeamFilterName(teamFilter);
  blocks.push({ type: "heading", content: filterName ? `${teamFilter?.toUpperCase()} Sector Performance` : "Sector Performance Analysis" });

  // Aggregate best sectors by team
  const teamSectors = new Map<string, { bestS1: number; bestS2: number; bestS3: number; count: number }>();
  for (const { doc } of allAn) {
    for (const team of doc.teams) {
      if (filterName && !team.team.toLowerCase().includes(filterName)) continue;
      const validLaps = team.laps.filter((l) => l.sector1 !== null && l.sector2 !== null && l.sector3 !== null);
      if (validLaps.length === 0) continue;
      const bestS1 = Math.min(...validLaps.map((l) => l.sector1!));
      const bestS2 = Math.min(...validLaps.map((l) => l.sector2!));
      const bestS3 = Math.min(...validLaps.map((l) => l.sector3!));
      const existing = teamSectors.get(team.team);
      if (!existing) {
        teamSectors.set(team.team, { bestS1, bestS2, bestS3, count: validLaps.length });
      } else {
        teamSectors.set(team.team, {
          bestS1: Math.min(existing.bestS1, bestS1),
          bestS2: Math.min(existing.bestS2, bestS2),
          bestS3: Math.min(existing.bestS3, bestS3),
          count: existing.count + validLaps.length,
        });
      }
    }
  }

  if (teamSectors.size === 0) {
    blocks.push({
      type: "text",
      content: filterName
        ? "No sector data matched that team in the current dataset."
        : "No sector data available in the current dataset. Sector analysis requires detailed lap analysis PDFs.",
    });
    return { title: "Sector Analysis", blocks };
  }

  const sorted = [...teamSectors.entries()].sort((a, b) => (a[1].bestS1 + a[1].bestS2 + a[1].bestS3) - (b[1].bestS1 + b[1].bestS2 + b[1].bestS3));

  blocks.push({
    type: "chart",
    chartType: "bar",
    chartData: sorted.slice(0, 8).map(([team, d]) => ({
      team: team.length > 15 ? team.slice(0, 13) + ".." : team,
      S1: +d.bestS1.toFixed(3),
      S2: +d.bestS2.toFixed(3),
      S3: +d.bestS3.toFixed(3),
    })),
    chartConfig: {
      xKey: "team",
      yKeys: [
        { key: "S1", color: "#00d4ff", name: "Sector 1" },
        { key: "S2", color: "#00ff88", name: "Sector 2" },
        { key: "S3", color: "#a855f7", name: "Sector 3" },
      ],
      height: 350,
    },
  });

  blocks.push({
    type: "table",
    tableData: {
      headers: ["Team", "Best S1", "Best S2", "Best S3", "Total", "Laps"],
      rows: sorted.map(([team, d]) => [
        team, d.bestS1.toFixed(3), d.bestS2.toFixed(3), d.bestS3.toFixed(3),
        (d.bestS1 + d.bestS2 + d.bestS3).toFixed(3), String(d.count),
      ]),
    },
  });

  // Find which team is best in each sector
  const bestS1Team = sorted.reduce((a, b) => a[1].bestS1 < b[1].bestS1 ? a : b);
  const bestS2Team = sorted.reduce((a, b) => a[1].bestS2 < b[1].bestS2 ? a : b);
  const bestS3Team = sorted.reduce((a, b) => a[1].bestS3 < b[1].bestS3 ? a : b);

  blocks.push({
    type: "stat-grid",
    stats: [
      { label: "Best Sector 1", value: bestS1Team[1].bestS1.toFixed(3) + "s", color: "#00d4ff", sub: bestS1Team[0] },
      { label: "Best Sector 2", value: bestS2Team[1].bestS2.toFixed(3) + "s", color: "#00ff88", sub: bestS2Team[0] },
      { label: "Best Sector 3", value: bestS3Team[1].bestS3.toFixed(3) + "s", color: "#a855f7", sub: bestS3Team[0] },
    ],
  });

  return { title: "Sector Performance", blocks };
}

function analyzeTeam(
  allCls: ClassificationEntry[],
  allAn: AnalysisEntry[],
  allChamp: ChampionshipEntry[],
  teamFilter: string
): CanvasResult {
  const blocks: AnalysisBlock[] = [];
  const filterName = getTeamFilterName(teamFilter)!;
  const displayName = teamFilter === "tbr" ? "Team Blue Rising" : teamFilter.charAt(0).toUpperCase() + teamFilter.slice(1);

  blocks.push({ type: "heading", content: `${displayName} — Full Team Report` });

  // Race results
  const results: { season: string; race: string; session: string; pos: number | string; pilot: string; laps: number; time: string | null }[] = [];
  for (const { season, race, doc } of allCls) {
    for (const r of doc.results) {
      if (r.team?.toLowerCase().includes(filterName)) {
        results.push({ season, race, session: doc.session, pos: r.pos, pilot: r.pilot, laps: r.laps, time: r.total_time });
      }
    }
  }

  if (results.length > 0) {
    const finishes = results.filter((r) => typeof r.pos === "number").map((r) => r.pos as number);
    const avgPos = finishes.length > 0 ? (finishes.reduce((a, b) => a + b, 0) / finishes.length).toFixed(1) : "N/A";
    const bestPos = finishes.length > 0 ? Math.min(...finishes) : 0;
    const podiums = finishes.filter((p) => p <= 3).length;
    const wins = finishes.filter((p) => p === 1).length;

    blocks.push({
      type: "stat-grid",
      stats: [
        { label: "Races", value: String(results.length), color: "#00d4ff" },
        { label: "Best Finish", value: bestPos ? `P${bestPos}` : "N/A", color: "#ffd700" },
        { label: "Avg Position", value: avgPos, color: "#00ff88" },
        { label: "Podiums", value: String(podiums), color: "#a855f7" },
        { label: "Wins", value: String(wins), color: "#ff0040" },
      ],
    });

    // Position chart
    const posData = results.filter((r) => typeof r.pos === "number").map((r) => ({
      race: `${r.session.slice(0, 15)}`,
      position: r.pos as number,
    }));
    if (posData.length > 1) {
      blocks.push({
        type: "chart",
        chartType: "line",
        chartData: posData,
        chartConfig: {
          xKey: "race",
          yKeys: [{ key: "position", color: "#0047FF", name: "Finish Position" }],
          height: 250,
        },
      });
    }

    blocks.push({
      type: "table",
      tableData: {
        headers: ["Season", "Race", "Session", "Pos", "Pilot", "Time"],
        rows: results.map((r) => [r.season, r.race, r.session, String(r.pos), r.pilot, r.time || "-"]),
      },
    });
  } else {
    blocks.push({ type: "text", content: "No detailed race results found for this team. Classification data may not have been fully extracted from older PDFs." });
  }

  // Championship progression
  const champData: { round: string; pos: number; points: number }[] = [];
  for (const { season, race, doc } of allChamp) {
    const standing = doc.standings.find((s) => s.team.toLowerCase().includes(filterName));
    if (standing) {
      champData.push({ round: `${season.replace("Season ", "S")} ${race}`, pos: standing.pos, points: standing.points });
    }
  }

  if (champData.length > 0) {
    blocks.push({ type: "text", content: "**Championship Progression:**" });
    blocks.push({
      type: "chart",
      chartType: "line",
      chartData: champData.map((c) => ({ round: c.round.replace(/S\d+ - \d+ /, ""), position: c.pos, points: c.points })),
      chartConfig: {
        xKey: "round",
        yKeys: [{ key: "position", color: "#ffd700", name: "Championship Position" }],
        height: 250,
      },
    });
    blocks.push({
      type: "table",
      tableData: {
        headers: ["Round", "Position", "Points"],
        rows: champData.map((c) => [c.round, `P${c.pos}`, String(c.points)]),
      },
    });
  }

  // Collect pilot names from classification results (cleanest source)
  const pilots = new Set<string>();
  for (const { doc } of allCls) {
    for (const r of doc.results) {
      if (r.team?.toLowerCase().includes(filterName) && r.pilot) {
        pilots.add(r.pilot);
      }
    }
  }

  // Analysis data
  let totalLaps = 0, totalSL = 0, totalLL = 0;
  for (const { doc } of allAn) {
    for (const team of doc.teams) {
      if (team.team.toLowerCase().includes(filterName)) {
        totalLaps += team.laps.length;
        totalSL += team.laps.filter((l) => l.marker === "SL").length;
        totalLL += team.laps.filter((l) => l.marker === "LL").length;
        for (const p of team.pilots) {
          // Clean pilot names: remove leading numbers, lap data, and non-name characters
          const cleaned = p.replace(/^\d+\./, "").trim();
          // Only keep if it looks like a name (has letters, no excessive numbers)
          if (cleaned && /^[A-Za-zÀ-ÿ\s'-]+$/.test(cleaned) && cleaned.length > 2) {
            pilots.add(cleaned);
          }
        }
      }
    }
  }

  if (pilots.size > 0) {
    blocks.push({ type: "text", content: `**Pilots:** ${[...pilots].join(", ")}` });
  }
  if (totalLaps > 0) {
    blocks.push({ type: "text", content: `**Lap Analysis:** ${totalLaps} laps tracked, ${totalSL} short laps, ${totalLL} long laps` });
  }

  return { title: `${displayName} Report`, blocks };
}

function analyzePilots(
  _data: AllData,
  allCls: ClassificationEntry[],
  allAn: AnalysisEntry[]
): CanvasResult {
  const blocks: AnalysisBlock[] = [];
  blocks.push({ type: "heading", content: "Pilot Leaderboard" });

  // Count fastest laps by pilot
  const pilotFLs = new Map<string, number>();
  for (const { doc } of allCls) {
    if (doc.fastest_lap?.pilot) {
      pilotFLs.set(doc.fastest_lap.pilot, (pilotFLs.get(doc.fastest_lap.pilot) || 0) + 1);
    }
  }

  const topFL = [...pilotFLs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  blocks.push({
    type: "chart",
    chartType: "bar",
    chartData: topFL.map(([pilot, count]) => ({ pilot, count })),
    chartConfig: {
      xKey: "pilot",
      yKeys: [{ key: "count", color: "#ff0040", name: "Fastest Laps" }],
      height: 300,
    },
  });

  blocks.push({
    type: "table",
    tableData: {
      headers: ["Pilot", "Fastest Laps Set"],
      rows: topFL.map(([pilot, count]) => [pilot, String(count)]),
    },
  });

  // Pilots from analysis data
  const pilotTeams = new Map<string, Set<string>>();
  for (const { doc } of allAn) {
    for (const team of doc.teams) {
      for (const pilot of team.pilots) {
        if (!pilotTeams.has(pilot)) pilotTeams.set(pilot, new Set());
        pilotTeams.get(pilot)!.add(team.team);
      }
    }
  }

  if (pilotTeams.size > 0) {
    blocks.push({ type: "text", content: `**${pilotTeams.size} pilots** identified across all analysis data.` });
  }

  return { title: "Pilot Leaderboard", blocks };
}

function analyzeOverview(
  data: AllData,
  allCls: ClassificationEntry[],
  allAn: AnalysisEntry[],
  allChamp: ChampionshipEntry[]
): CanvasResult {
  const blocks: AnalysisBlock[] = [];
  blocks.push({ type: "heading", content: "E1 Championship Overview" });

  const seasons = Object.keys(data.seasons);
  const totalRaces = Object.values(data.seasons).reduce((acc, s) => acc + Object.keys(s.races).length, 0);
  const totalSessions = allCls.length;
  const sessionsWithResults = allCls.filter((c) => c.doc.results.length > 0).length;

  blocks.push({
    type: "stat-grid",
    stats: [
      { label: "Seasons", value: String(seasons.length), color: "#00d4ff" },
      { label: "Race Weekends", value: String(totalRaces), color: "#00ff88" },
      { label: "Total Sessions", value: String(totalSessions), color: "#a855f7" },
      { label: "With Full Results", value: String(sessionsWithResults), color: "#ff8800" },
      { label: "Analysis Sessions", value: String(allAn.length), color: "#ff0040" },
    ],
  });

  // Races per season
  const seasonRaces = Object.entries(data.seasons).map(([name, sData]) => ({
    season: name.replace("Season ", "S"),
    races: Object.keys(sData.races).length,
  }));
  blocks.push({
    type: "chart",
    chartType: "bar",
    chartData: seasonRaces,
    chartConfig: {
      xKey: "season",
      yKeys: [{ key: "races", color: "#00d4ff", name: "Races" }],
      height: 200,
    },
  });

  // Latest championship standings
  const latestChamp = allChamp[allChamp.length - 1];
  if (latestChamp) {
    blocks.push({ type: "text", content: `**Latest Championship** — ${latestChamp.season}, ${latestChamp.race}` });
    blocks.push({
      type: "chart",
      chartType: "bar",
      chartData: latestChamp.doc.standings.map((s) => ({
        team: s.team.length > 15 ? s.team.slice(0, 13) + ".." : s.team,
        points: s.points,
      })),
      chartConfig: {
        xKey: "team",
        yKeys: [{ key: "points", color: "#ffd700", name: "Points" }],
        height: 300,
      },
    });
  }

  // Fastest lap speed distribution
  const speeds = allCls.filter((c) => c.doc.fastest_lap?.kph).map((c) => c.doc.fastest_lap!.kph);
  if (speeds.length > 0) {
    const avgSpeed = (speeds.reduce((a, b) => a + b, 0) / speeds.length).toFixed(1);
    const maxSpeed = Math.max(...speeds).toFixed(1);
    blocks.push({
      type: "text",
      content: `**Speed insights:** Average fastest lap speed across all sessions is **${avgSpeed} km/h**, with a peak of **${maxSpeed} km/h**.`,
    });
  }

  blocks.push({
    type: "text",
    content: "Try asking about specific teams (e.g., \"Team Blue Rising performance\"), pilots, sectors, fastest laps, or championship standings for deeper analysis.",
  });

  return { title: "E1 Championship Overview", blocks };
}

// ─── Chart Renderer ─────────────────────────────────────────────────────────

function ChartBlock({ block }: { block: AnalysisBlock }) {
  if (!block.chartData || !block.chartConfig) return null;
  const { xKey, yKeys, height = 300 } = block.chartConfig;

  const tooltipStyle = { backgroundColor: "#1e1e35", border: "1px solid #333", borderRadius: "8px", fontSize: "12px" };

  if (block.chartType === "bar") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={block.chartData} margin={{ top: 10, right: 20, left: 10, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis dataKey={xKey} stroke="#666" tick={{ fill: "#888", fontSize: 10 }} interval={0} />
          <YAxis stroke="#666" tick={{ fill: "#888", fontSize: 11 }} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: "11px" }} />
          {yKeys.map((yk) => (
            <Bar key={yk.key} dataKey={yk.key} fill={yk.color} name={yk.name} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (block.chartType === "line") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={block.chartData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis dataKey={xKey} stroke="#666" tick={{ fill: "#888", fontSize: 10 }} />
          <YAxis stroke="#666" tick={{ fill: "#888", fontSize: 11 }} reversed />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: "11px" }} />
          {yKeys.map((yk) => (
            <Line key={yk.key} type="monotone" dataKey={yk.key} stroke={yk.color} strokeWidth={2} dot={{ r: 4 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (block.chartType === "pie") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={block.chartData} dataKey={yKeys[0].key} nameKey={xKey} cx="50%" cy="50%" outerRadius={100} label>
            {block.chartData.map((_, i) => (
              <Cell key={i} fill={["#00d4ff", "#00ff88", "#ff0040", "#a855f7", "#ff8800", "#ffd700"][i % 6]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  return null;
}

function renderTextContent(content: string) {
  return content
    .split(/(\*\*.*?\*\*)/g)
    .filter(Boolean)
    .map((segment, index) => {
      if (segment.startsWith("**") && segment.endsWith("**")) {
        return (
          <strong key={index} className="text-[var(--text-primary)]">
            {segment.slice(2, -2)}
          </strong>
        );
      }

      return <span key={index}>{segment}</span>;
    });
}

// ─── Suggested Queries ──────────────────────────────────────────────────────

const SUGGESTED_QUERIES = [
  "Team Blue Rising performance overview",
  "Championship standings across seasons",
  "Fastest laps analysis",
  "Sector performance comparison",
  "Mistakes and penalties for Team Brady",
  "Pilot leaderboard",
  "Team Blue Rising mistakes and penalties",
  "Overview of all seasons",
];

// ─── Main Canvas Page ───────────────────────────────────────────────────────

export default function CanvasPage() {
  const [data, setData] = useState<AllData | null>(null);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<CanvasResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const analysisTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    let isMounted = true;

    getAllData()
      .then((loadedData) => {
        if (!isMounted) return;
        setData(loadedData);
      })
      .catch((error: unknown) => {
        if (!isMounted) return;
        setLoadError(error instanceof Error ? error.message : "Failed to load analytics data.");
      });

    return () => {
      isMounted = false;
      if (analysisTimeoutRef.current !== null) {
        window.clearTimeout(analysisTimeoutRef.current);
      }
    };
  }, []);

  const analysisContext = useMemo(() => (data ? buildAnalysisContext(data) : null), [data]);

  const runAnalysis = useCallback((q: string) => {
    if (!analysisContext || !q.trim()) return;

    if (analysisTimeoutRef.current !== null) {
      window.clearTimeout(analysisTimeoutRef.current);
    }

    setIsAnalyzing(true);
    setQuery(q);

    // Simulate brief processing time for UX
    analysisTimeoutRef.current = window.setTimeout(() => {
      const r = analyzeQuery(q, analysisContext);
      setResult(r);
      setIsAnalyzing(false);
      setHistory((prev) => [q, ...prev.filter((h) => h !== q)].slice(0, 10));
      analysisTimeoutRef.current = null;
    }, 200);
  }, [analysisContext]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runAnalysis(query);
  };

  if (!data) {
    if (loadError) {
      return (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="max-w-md rounded-2xl border border-[rgba(255,0,64,0.35)] bg-[rgba(255,0,64,0.08)] px-6 py-5 text-center">
            <div className="font-display text-sm tracking-wider text-[var(--accent-red)]">DATA UNAVAILABLE</div>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">{loadError}</p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[var(--accent-cyan)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <div className="font-display text-sm tracking-wider text-[var(--text-muted)]">LOADING DATA</div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold tracking-wider mb-1">CANVAS</h1>
        <p className="text-[var(--text-secondary)] text-sm">
          Ask questions about E1 race data. Get instant analysis with charts, tables, and insights.
        </p>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSubmit} className="mb-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask about teams, pilots, fastest laps, sectors, championships..."
            className="w-full pl-12 pr-32 py-4 bg-white border-2 border-[#B8BEC9] rounded-xl text-[var(--text-primary)] text-sm font-body placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-cyan)] transition-colors"
          />
          <button
            type="submit"
            disabled={isAnalyzing || !query.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-5 py-2 bg-[var(--accent-cyan)] text-white font-display text-xs font-bold tracking-wider rounded-lg hover:bg-[#003DA5] transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Sparkles className="w-3.5 h-3.5" />
            ANALYZE
          </button>
        </div>
      </form>

      {/* Suggested Queries (show when no result) */}
      {!result && !isAnalyzing && (
        <div className="mb-8">
          <div className="text-xs text-[var(--text-muted)] uppercase tracking-widest mb-3">Suggested queries</div>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUERIES.map((sq) => (
              <button
                key={sq}
                onClick={() => { setQuery(sq); runAnalysis(sq); }}
                className="px-3 py-2 bg-white border border-[#B8BEC9] rounded-lg text-xs text-[#3D4A5C] hover:border-[var(--accent-cyan)] hover:text-[var(--accent-cyan)] transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <ChevronRight className="w-3 h-3" />
                {sq}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading State */}
      {isAnalyzing && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-[var(--accent-purple)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <div className="font-display text-xs tracking-wider text-[var(--text-muted)]">ANALYZING DATA</div>
          </div>
        </div>
      )}

      {/* Results */}
      {result && !isAnalyzing && (
        <div className="space-y-5">
          {/* Result Header */}
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold tracking-wider text-[var(--accent-cyan)]">
              {result.title}
            </h2>
            <button
              onClick={() => { setResult(null); setQuery(""); }}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Blocks */}
          {result.blocks.map((block, i) => (
            <div key={i}>
              {block.type === "heading" && (
                <h3 className="font-display text-sm font-bold tracking-wider text-[var(--text-primary)] uppercase mt-4">{block.content}</h3>
              )}

              {block.type === "text" && (
                <div className="text-sm text-[var(--text-secondary)] leading-relaxed">{renderTextContent(block.content || "")}</div>
              )}

              {block.type === "stat-grid" && block.stats && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  {block.stats.map((stat, j) => (
                    <div key={j} className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-4 text-center">
                      <div className="font-numbers text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</div>
                      <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mt-1">{stat.label}</div>
                      {stat.sub && <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">{stat.sub}</div>}
                    </div>
                  ))}
                </div>
              )}

              {block.type === "chart" && (
                <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-4">
                  <ChartBlock block={block} />
                </div>
              )}

              {block.type === "table" && block.tableData && (
                <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-x-auto">
                  <table className="w-full race-table text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border-color)]">
                        {block.tableData.headers.map((h, j) => (
                          <th key={j} className="text-left px-3 py-2.5 text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {block.tableData.rows.map((row, j) => (
                        <tr key={j} className="border-b border-[var(--border-color)]/20">
                          {row.map((cell, k) => (
                            <td key={k} className={`px-3 py-2 ${k === 0 ? "font-semibold" : "text-[var(--text-secondary)]"}`}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}

          {/* History */}
          {history.length > 1 && (
            <div className="mt-8 pt-4 border-t border-[var(--border-color)]">
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest mb-2">Recent queries</div>
              <div className="flex flex-wrap gap-2">
                {history.slice(1).map((h, i) => (
                  <button
                    key={i}
                    onClick={() => { setQuery(h); runAnalysis(h); }}
                    className="px-2 py-1 bg-[var(--bg-secondary)] rounded text-[10px] text-[var(--text-muted)] hover:text-[var(--accent-cyan)] transition-colors cursor-pointer"
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AllData, ChampionshipDoc } from "@/lib/types";
import { getAllData } from "@/lib/data";
import { collectEventSessions, parseSessionMetrics, isRaceLikeSession } from "@/lib/race";
import "./dashboard.css";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SessionData {
  key: string;
  name: string;
  title: string;
  laps: number | null;
  distance: string;
  wind: string;
  fastestLap: { pilot: string; time: string; lap: number; kph: number } | null;
  penalties: string[];
  teams: string[];
  grid: { pos: number; team: string; pilot: string; no: string }[];
  results: {
    pos: number | string;
    team: string;
    pilot: string;
    no: string;
    time: string;
    gap: string;
    kph: number | string;
    bestLap: string;
    bestLapNo: number | string;
    sl: string;
    ll: string;
    start: number | string;
    passed: number | string;
    note: string;
  }[];
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function RaceDashboard() {
  const params = useParams();
  const season = decodeURIComponent(params.season as string);
  const raceName = decodeURIComponent(params.raceName as string);

  const [data, setData] = useState<AllData | null>(null);
  const [activeRace, setActiveRace] = useState<string>("summary");
  const [isDark, setIsDark] = useState(true);
  const [gainsView, setGainsView] = useState<"pilot" | "team">("pilot");
  const [expandedBreakdowns, setExpandedBreakdowns] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    getAllData()
      .then((loadedData) => {
        if (!isMounted) return;
        setData(loadedData);
      })
      .catch((error: unknown) => {
        if (!isMounted) return;
        setLoadError(error instanceof Error ? error.message : "Failed to load race data.");
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const raceData = useMemo(() => {
    if (!data) return null;
    return data.seasons[season]?.races[raceName] || null;
  }, [data, season, raceName]);

  // Build session data from every available document so older weekends stay usable.
  const sessions = useMemo((): SessionData[] => {
    if (!raceData) return [];
    return collectEventSessions(raceData.events).map((session) => {
      const classification = session.classification;
      const analysis = session.analysis;
      const gridDoc = session.grid;
      const parsedMetrics = parseSessionMetrics(gridDoc?.session ?? session.title);

      const gridEntries = gridDoc?.grid?.map((gridEntry) => ({
        pos: gridEntry.pos,
        team: gridEntry.team,
        pilot: gridEntry.pilot,
        no: gridEntry.no,
      })) ?? [];

      const gridMap = new Map<string, number>();
      for (const gridEntry of gridEntries) {
        gridMap.set(gridEntry.no, gridEntry.pos);
      }

      const slLlMap = new Map<string, { sl: number[]; ll: number[] }>();
      if (analysis?.teams) {
        for (const team of analysis.teams) {
          const info: { sl: number[]; ll: number[] } = { sl: [], ll: [] };
          for (const lap of team.laps) {
            if (lap.marker === "SL") info.sl.push(lap.lap);
            if (lap.marker === "LL") info.ll.push(lap.lap);
          }
          slLlMap.set(team.no, info);
        }
      }

      const results = classification?.results.map((result) => {
        const gridPos = gridMap.get(result.no);
        const posNum = typeof result.pos === "number" ? result.pos : null;
        const passed: number | string = gridPos !== undefined && posNum !== null ? gridPos - posNum : "-";
        const slLl = slLlMap.get(result.no);

        return {
          pos: result.pos,
          team: result.team,
          pilot: result.pilot,
          no: result.no,
          time: result.total_time || "-",
          gap: result.gap || "-",
          kph: result.kph || "-",
          bestLap: result.best_lap?.time || "-",
          bestLapNo: (result.best_lap?.lap ?? "-") as number | string,
          sl: slLl && slLl.sl.length > 0 ? slLl.sl.join(",") : "-",
          ll: slLl && slLl.ll.length > 0 ? slLl.ll.join(",") : "-",
          start: (gridPos ?? "-") as number | string,
          passed,
          note: result.note || "",
        };
      }) ?? [];

      const teams = new Set<string>([
        ...gridEntries.map((entry) => entry.team),
        ...results.map((result) => result.team),
        ...(analysis?.teams.map((team) => team.team) ?? []),
      ]);

      const penalties = results
        .filter((result) => result.note && result.note.toLowerCase().includes("penalty"))
        .map((result) => `${result.team.toUpperCase()} - ${result.note.toUpperCase()}`);

      return {
        key: session.key,
        name: session.key,
        title: session.title,
        laps: classification?.laps ?? parsedMetrics.laps,
        distance: classification?.distance || parsedMetrics.distance,
        wind: classification?.wind || "",
        fastestLap: classification?.fastest_lap
          ? {
              pilot: classification.fastest_lap.pilot,
              time: classification.fastest_lap.time,
              lap: classification.fastest_lap.lap,
              kph: classification.fastest_lap.kph,
            }
          : null,
        penalties,
        teams: [...teams],
        grid: gridEntries,
        results,
      };
    });
  }, [raceData]);

  // Only race-like sessions (no practice/qualifying) for tabs and summary
  const raceSessions = useMemo(() => {
    return sessions.filter(s => isRaceLikeSession(s.title));
  }, [sessions]);

  // Championship data
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

  const roundNumber = raceName.match(/R(\d+)/)?.[1] || "?";
  const location = raceName.replace(/^R\d+\s+/, "");
  const seasonNumber = season.match(/Season (\d+)/)?.[1] || "?";
  const seasonYear = season.match(/(\d{4})/)?.[1] || "?";

  const toggleBreakdown = useCallback((id: string) => {
    setExpandedBreakdowns(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Calculate position gains across all sessions
  const positionGains = useMemo(() => {
    const pilotGains: Record<string, { total: number; team: string; penalties: number; breakdown: { race: string; gained: number | string; start: number | string; finish: number | string; penalty: string | null }[] }> = {};
    const teamGains: Record<string, { total: number; penalties: number; breakdown: { race: string; pilot: string; gained: number | string; start: number | string; finish: number | string; penalty: string | null }[]; pilots: Record<string, { total: number; penalties: number }> }> = {};

    for (const session of raceSessions) {
      for (const r of session.results) {
        const passed = typeof r.passed === "number" ? r.passed : 0;
        const hasPenalty = r.note && r.note.toLowerCase().includes("penalty");

        if (!pilotGains[r.pilot]) {
          pilotGains[r.pilot] = { total: 0, team: r.team, penalties: 0, breakdown: [] };
        }
        pilotGains[r.pilot].total += passed;
        if (hasPenalty) pilotGains[r.pilot].penalties += 1;
        pilotGains[r.pilot].breakdown.push({
          race: session.title,
          gained: r.passed,
          start: r.start,
          finish: r.pos,
          penalty: hasPenalty ? r.note : null,
        });

        if (!teamGains[r.team]) {
          teamGains[r.team] = { total: 0, penalties: 0, breakdown: [], pilots: {} };
        }
        teamGains[r.team].total += passed;
        if (hasPenalty) teamGains[r.team].penalties += 1;
        teamGains[r.team].breakdown.push({
          race: session.title,
          pilot: r.pilot,
          gained: r.passed,
          start: r.start,
          finish: r.pos,
          penalty: hasPenalty ? r.note : null,
        });
        if (!teamGains[r.team].pilots[r.pilot]) {
          teamGains[r.team].pilots[r.pilot] = { total: 0, penalties: 0 };
        }
        teamGains[r.team].pilots[r.pilot].total += passed;
        if (hasPenalty) teamGains[r.team].pilots[r.pilot].penalties += 1;
      }
    }

    return { pilotGains, teamGains };
  }, [raceSessions]);

  // Race winners
  const raceWinners = useMemo(() => {
    return raceSessions
      .filter(s => s.results.length > 0 && s.results[0].pos === 1)
      .map(s => {
        const winner = s.results[0];
        return {
          race: s.title,
          team: winner.team,
          pilot: winner.pilot,
          sl: winner.sl,
          ll: winner.ll,
          start: winner.start,
        };
      });
  }, [raceSessions]);

  // Biggest gainers/losers
  const biggestGainers = useMemo(() => {
    const all: { race: string; pilot: string; team: string; start: number; finish: number; gained: number; sl: string; ll: string }[] = [];
    for (const s of raceSessions) {
      for (const r of s.results) {
        if (typeof r.passed === "number" && typeof r.start === "number" && typeof r.pos === "number") {
          all.push({ race: s.title, pilot: r.pilot, team: r.team, start: r.start, finish: r.pos, gained: r.passed, sl: r.sl, ll: r.ll });
        }
      }
    }
    return all.sort((a, b) => b.gained - a.gained);
  }, [raceSessions]);

  // Fastest laps across race sessions
  const fastestLaps = useMemo(() => {
    return raceSessions
      .filter(s => s.fastestLap)
      .map(s => {
        const flPilot = s.fastestLap!.pilot;
        const flTeam = s.results.find(r => r.pilot === flPilot)?.team || s.results[0]?.team || "";
        return { race: s.title, team: flTeam, ...s.fastestLap! };
      })
      .sort((a, b) => {
        const ta = timeToSeconds(a.time);
        const tb = timeToSeconds(b.time);
        return (ta || 999) - (tb || 999);
      });
  }, [raceSessions]);

  const totalPenalties = raceSessions.reduce((sum, s) => sum + s.penalties.length, 0);
  const uniqueTeams = new Set(raceSessions.flatMap((session) => session.teams));
  const overallFastestLap = fastestLaps[0]?.time || "-";
  const hasResultData = raceSessions.some((session) => session.results.length > 0);

  if (!data) {
    if (loadError) {
      return (
        <div className={`jeddah-dashboard ${isDark ? "" : "light-mode"}`}>
          <div style={{ textAlign: "center", padding: "80px 20px" }}>
            <div style={{ fontFamily: "var(--jd-font-display)", fontSize: "1.2rem", color: "#ff0040", marginBottom: "8px" }}>
              DATA UNAVAILABLE
            </div>
            <p style={{ color: "#666" }}>{loadError}</p>
          </div>
        </div>
      );
    }

    return (
      <div className={`jeddah-dashboard ${isDark ? "" : "light-mode"}`}>
        <div className="jd-loading">
          <div style={{ textAlign: "center" }}>
            <div className="jd-spinner" />
            <div style={{ fontFamily: "var(--jd-font-display)", fontSize: "0.85rem", letterSpacing: "2px", color: "#666", marginTop: "16px" }}>
              LOADING DATA
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!raceData) {
    return (
      <div className={`jeddah-dashboard ${isDark ? "" : "light-mode"}`}>
        <div style={{ textAlign: "center", padding: "80px 20px" }}>
          <div style={{ fontFamily: "var(--jd-font-display)", fontSize: "1.2rem", color: "#ff0040", marginBottom: "8px" }}>
            RACE NOT FOUND
          </div>
          <p style={{ color: "#666" }}>No data for {season} / {raceName}</p>
          <Link href="/" style={{ color: "#00d4ff", marginTop: "16px", display: "inline-block" }}>&larr; Back to Seasons</Link>
        </div>
      </div>
    );
  }

  const activeSession = raceSessions.find((session) => session.key === activeRace);

  return (
    <div className={`jeddah-dashboard ${isDark ? "" : "light-mode"}`}>
      {/* Sub Header */}
      <div className="jd-sub-header">
        <div className="jd-sub-header-content">
          <div className="jd-event-title">
            <Link href="/" className="jd-back-link">&larr; Back</Link>
            <img src="/tbr-logo.svg" alt="TBR" style={{ height: "36px", width: "36px" }} />
            <h1>{location} GP Analysis by TBR</h1>
            <span className="round">R{roundNumber}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "30px" }}>
            <div className="jd-event-stats">
              <div className="jd-stat-item">
                <div className="jd-stat-value">S{seasonNumber}</div>
                <div className="jd-stat-label">Season</div>
              </div>
              <div className="jd-stat-item">
                <div className="jd-stat-value">{seasonYear}</div>
                <div className="jd-stat-label">Year</div>
              </div>
              <div className="jd-stat-item">
                <div className="jd-stat-value">{uniqueTeams.size}</div>
                <div className="jd-stat-label">Teams</div>
              </div>
              <div className="jd-stat-item">
                <div className="jd-stat-value">{raceSessions.length}</div>
                <div className="jd-stat-label">Races</div>
              </div>
            </div>
            {/* Theme Toggle */}
            <div className="jd-theme-toggle">
              <span className="jd-theme-icon">&#127769;</span>
              <button
                type="button"
                className="jd-toggle-switch"
                onClick={() => setIsDark(!isDark)}
                aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              />
              <span className="jd-theme-icon">&#9728;&#65039;</span>
            </div>
          </div>
        </div>
      </div>

      {/* Race Selector */}
      <div className="jd-race-selector">
        <div className="jd-race-selector-content">
          <div className="jd-race-selector-header">
            <span className="jd-race-selector-label">Select Race</span>
            <div className="jd-current-race-badge">
              <span className="viewing-label">Viewing:</span>
              <span>{activeRace === "summary" ? "Summary" : activeRace === "__championship__" ? "Championship" : activeSession?.title || activeRace}</span>
            </div>
          </div>
          <nav className="jd-nav-tabs">
            {raceSessions.map((session) => (
              <button
                key={session.key}
                onClick={() => setActiveRace(session.key)}
                className={`jd-nav-tab ${activeRace === session.key ? "active" : ""}`}
              >
                {session.title}
              </button>
            ))}
            {championship && (
              <button
                onClick={() => setActiveRace("__championship__")}
                className={`jd-nav-tab ${activeRace === "__championship__" ? "active" : ""}`}
              >
                Championship
              </button>
            )}
            <button
              onClick={() => setActiveRace("summary")}
              className={`jd-nav-tab summary-tab ${activeRace === "summary" ? "active" : ""}`}
            >
              Summary
            </button>
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="jd-main-content">
        {activeSession && <RaceView session={activeSession} />}
        {activeRace === "__championship__" && championship && <ChampionshipView standings={championship.standings} />}
        {activeRace === "summary" && (
          <SummaryView
            sessions={raceSessions}
            totalPenalties={totalPenalties}
            uniqueTeamCount={uniqueTeams.size}
            overallFastestLap={overallFastestLap}
            hasResultData={hasResultData}
            positionGains={positionGains}
            raceWinners={raceWinners}
            biggestGainers={biggestGainers}
            fastestLaps={fastestLaps}
            gainsView={gainsView}
            setGainsView={setGainsView}
            expandedBreakdowns={expandedBreakdowns}
            toggleBreakdown={toggleBreakdown}
          />
        )}
      </main>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function timeToSeconds(t: string | null): number | null {
  if (!t || t === "-") return null;
  const parts = t.split(":");
  if (parts.length === 3) return +parts[0] * 3600 + +parts[1] * 60 + +parts[2];
  if (parts.length === 2) return +parts[0] * 60 + +parts[1];
  return +parts[0] || null;
}

function getPassedClass(passed: number | string): string {
  if (passed === "-") return "jd-passed-neutral";
  if (typeof passed === "number" && passed > 0) return "jd-passed-positive";
  if (typeof passed === "number" && passed < 0) return "jd-passed-negative";
  return "jd-passed-neutral";
}

function formatPassed(passed: number | string): string {
  if (passed === "-") return "-";
  if (typeof passed === "number" && passed > 0) return "+" + passed;
  return String(passed);
}

// ─── Race View ──────────────────────────────────────────────────────────────

function RaceView({ session }: { session: SessionData }) {
  const fastestLapTime = session.fastestLap?.time || "";

  return (
    <div>
      {/* Info Cards */}
      <div className="jd-info-cards">
        <div className="jd-info-card">
          <div className="jd-info-card-label">Distance</div>
          <div className="jd-info-card-value">{session.distance ? `${session.distance} km` : "-"}</div>
          <div className="jd-info-card-sub">{session.laps ? `${session.laps} Laps` : "-"}</div>
        </div>
        <div className="jd-info-card">
          <div className="jd-info-card-label">Wind Speed</div>
          <div className="jd-info-card-value">{session.wind ? `${session.wind} Kph` : "-"}</div>
          <div className="jd-info-card-sub">Conditions</div>
        </div>
        <div className="jd-info-card fastest">
          <div className="jd-info-card-label">Fastest Lap</div>
          <div className="jd-info-card-value">{session.fastestLap?.time || "-"}</div>
          <div className="jd-info-card-sub">
            {session.fastestLap ? `${session.fastestLap.pilot} \u2022 Lap ${session.fastestLap.lap}` : "-"}
          </div>
        </div>
        <div className="jd-info-card">
          <div className="jd-info-card-label">Top Speed</div>
          <div className="jd-info-card-value">{session.fastestLap ? `${session.fastestLap.kph} KPH` : "-"}</div>
          <div className="jd-info-card-sub">Maximum</div>
        </div>
      </div>

      {/* Penalties */}
      {session.penalties.length > 0 && (
        <div className="jd-penalties-bar">
          {session.penalties.map((p, i) => (
            <div key={i} className="jd-penalty-item">
              <span className="jd-penalty-icon">&#9888;</span>
              {p}
            </div>
          ))}
        </div>
      )}

      {/* Starting Grid */}
      {session.grid.length > 0 && (
        <div className="jd-section">
          <div className="jd-section-header">
            <span className="jd-section-title">Starting Grid</span>
          </div>
          <div className="jd-starting-grid">
            {session.grid.map((g, i) => (
              <div key={i} className={`jd-grid-position ${i === 0 ? "pole" : ""}`}>
                <div className="jd-grid-pos-number">{g.pos}</div>
                <div className="jd-grid-team">{g.team}</div>
                <div className="jd-grid-pilot">{g.pilot}</div>
                <div className="jd-grid-number">#{g.no}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Race Results */}
      {session.results.length > 0 && (
        <div className="jd-section">
          <div className="jd-section-header">
            <span className="jd-section-title">Race Results</span>
          </div>
          <table className="jd-results-table">
            <thead>
              <tr>
                <th>Pos</th>
                <th>Driver</th>
                <th className="center">Grid</th>
                <th className="center">SL</th>
                <th className="center">LL</th>
                <th className="center">Pos +/-</th>
                <th>Time</th>
                <th>Gap</th>
                <th className="center">KPH</th>
                <th>Best Lap</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {session.results.map((r, i) => (
                <tr key={i} className={i === 0 ? "winner" : ""}>
                  <td className={`jd-pos-cell ${r.pos === 1 ? "jd-pos-1" : r.pos === 2 ? "jd-pos-2" : r.pos === 3 ? "jd-pos-3" : ""}`}>
                    {r.pos}
                  </td>
                  <td>
                    <div className="jd-driver-cell">
                      <span className="jd-driver-number">{r.no}</span>
                      <div className="jd-driver-info">
                        <span className="jd-driver-name">{r.pilot}</span>
                        <span className="jd-driver-team">{r.team}</span>
                      </div>
                    </div>
                  </td>
                  <td className="jd-lap-cell">{r.start}</td>
                  <td className={`jd-lap-cell ${r.sl !== "-" && r.sl !== "" ? "sl" : ""}`}>{r.sl}</td>
                  <td className={`jd-lap-cell ${r.ll !== "-" && r.ll !== "" ? "ll" : ""}`}>{r.ll}</td>
                  <td className={`jd-passed-cell ${getPassedClass(r.passed)}`}>{formatPassed(r.passed)}</td>
                  <td className="jd-time-cell">{r.time}</td>
                  <td className={`jd-gap-cell ${r.gap === "-" || !r.gap ? "leader" : ""}`}>
                    {r.gap === "-" || !r.gap ? "LEADER" : r.gap}
                  </td>
                  <td className="jd-speed-cell">{r.kph}</td>
                  <td className={`jd-best-lap-cell ${r.bestLap === fastestLapTime ? "fastest" : ""}`}>
                    {r.bestLap}{r.bestLapNo !== "-" ? <span style={{ color: "#666" }}> (L{r.bestLapNo})</span> : ""}
                  </td>
                  <td className="jd-note-cell">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="jd-legend">
            <div className="jd-legend-item">
              <div className="jd-legend-color sl" />
              <span>SL = Short Lap</span>
            </div>
            <div className="jd-legend-item">
              <div className="jd-legend-color ll" />
              <span>LL = Long Lap</span>
            </div>
            <div className="jd-legend-item">
              <span className="jd-legend-indicator passed-positive">+N</span>
              <span>Positions Gained</span>
            </div>
            <div className="jd-legend-item">
              <span className="jd-legend-indicator passed-negative">-N</span>
              <span>Positions Lost</span>
            </div>
          </div>
        </div>
      )}

      {/* No results fallback */}
      {session.results.length === 0 && (
        <div className="jd-section">
          <div className="jd-section-header">
            <span className="jd-section-title">Race Results</span>
          </div>
          <div style={{ padding: "40px 20px", textAlign: "center", color: "#666" }}>
            Detailed results were not extracted from the PDF for this session.
            {session.fastestLap && (
              <div style={{ marginTop: "16px" }}>
                <span style={{ color: "#888" }}>Fastest lap by </span>
                <span style={{ fontWeight: 600, color: "var(--jd-text-primary)" }}>{session.fastestLap.pilot}</span>
                <span style={{ color: "#888" }}> &mdash; </span>
                <span style={{ fontFamily: "var(--jd-font-numbers)", fontWeight: 700, color: "var(--jd-accent-purple)" }}>{session.fastestLap.time}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Championship View ──────────────────────────────────────────────────────

function ChampionshipView({ standings }: { standings: ChampionshipDoc["standings"] }) {
  const maxPts = Math.max(...standings.map(s => s.points));

  return (
    <div className="jd-section">
      <div className="jd-section-header">
        <span className="jd-section-title">Championship Standings</span>
      </div>
      <table className="jd-championship-table">
        <thead>
          <tr>
            <th style={{ width: "60px" }}>Pos</th>
            <th>Team</th>
            <th style={{ width: "80px", textAlign: "right" }}>Points</th>
            <th style={{ width: "33%" }}></th>
          </tr>
        </thead>
        <tbody>
          {standings.map(s => (
            <tr key={s.pos}>
              <td>
                <span style={{
                  fontFamily: "var(--jd-font-numbers)",
                  fontWeight: 700,
                  fontSize: "1.1rem",
                  color: s.pos <= 3 ? "var(--jd-accent-gold)" : "var(--jd-text-secondary)",
                }}>
                  {s.pos}
                </span>
              </td>
              <td style={{ fontWeight: 600, color: "var(--jd-text-primary)" }}>{s.team}</td>
              <td style={{ textAlign: "right", fontFamily: "var(--jd-font-numbers)", fontWeight: 700, fontSize: "1.1rem" }}>
                {s.points}
              </td>
              <td>
                <div style={{ height: "8px", background: "var(--jd-border-dark)", borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${(s.points / maxPts) * 100}%`,
                    background: "linear-gradient(90deg, var(--jd-accent-cyan), var(--jd-accent-green))",
                    borderRadius: "4px",
                    transition: "width 0.5s ease",
                  }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Summary View ───────────────────────────────────────────────────────────

interface SummaryViewProps {
  sessions: SessionData[];
  totalPenalties: number;
  uniqueTeamCount: number;
  overallFastestLap: string;
  hasResultData: boolean;
  positionGains: {
    pilotGains: Record<string, { total: number; team: string; penalties: number; breakdown: { race: string; gained: number | string; start: number | string; finish: number | string; penalty: string | null }[] }>;
    teamGains: Record<string, { total: number; penalties: number; breakdown: { race: string; pilot: string; gained: number | string; start: number | string; finish: number | string; penalty: string | null }[]; pilots: Record<string, { total: number; penalties: number }> }>;
  };
  raceWinners: { race: string; team: string; pilot: string; sl: string; ll: string; start: number | string }[];
  biggestGainers: { race: string; pilot: string; team: string; start: number; finish: number; gained: number; sl: string; ll: string }[];
  fastestLaps: { race: string; pilot: string; team: string; time: string; lap: number; kph: number }[];
  gainsView: "pilot" | "team";
  setGainsView: (v: "pilot" | "team") => void;
  expandedBreakdowns: Set<string>;
  toggleBreakdown: (id: string) => void;
}

function SummaryView({
  sessions, totalPenalties, uniqueTeamCount, overallFastestLap, hasResultData,
  positionGains, raceWinners, biggestGainers, fastestLaps,
  gainsView, setGainsView, expandedBreakdowns, toggleBreakdown,
}: SummaryViewProps) {
  const gainers = biggestGainers.filter(g => g.gained > 0).slice(0, 5);
  const losers = [...biggestGainers].reverse().filter(g => g.gained < 0).slice(0, 5);
  const toLapNumbers = (value: string) =>
    value
      .split(",")
      .map((lap) => Number.parseInt(lap, 10))
      .filter((lap) => Number.isFinite(lap));

  const slLap2Winners = raceWinners.filter((winner) => toLapNumbers(winner.sl).includes(2));
  const llLateWinners = raceWinners.filter(w => toLapNumbers(w.ll).some((lap) => lap >= 5));

  // Late Short Lap (Lap 5-6) analysis
  const lateSLWinners = raceWinners.filter(w => toLapNumbers(w.sl).some((lap) => lap >= 5));

  // Lap 1 Long Lap analysis
  const lap1LLRaces = sessions.filter(s =>
    s.results.some(r => toLapNumbers(r.ll).includes(1))
  );

  return (
    <div>
      {/* Summary Cards */}
      <div className="jd-summary-grid">
        <div className="jd-summary-card blue">
          <div className="jd-summary-value">{sessions.length}</div>
          <div className="jd-summary-label">Races Completed</div>
        </div>
        <div className="jd-summary-card green">
          <div className="jd-summary-value">{uniqueTeamCount}</div>
          <div className="jd-summary-label">Teams Competed</div>
        </div>
        <div className="jd-summary-card purple">
          <div className="jd-summary-value">{overallFastestLap}</div>
          <div className="jd-summary-label">Fastest Lap</div>
        </div>
        <div className="jd-summary-card orange">
          <div className="jd-summary-value">{totalPenalties}</div>
          <div className="jd-summary-label">Penalties Issued</div>
        </div>
      </div>

      {!hasResultData && (
        <div className="jd-section">
          <div className="jd-section-header">
            <span className="jd-section-title">Coverage Note</span>
          </div>
          <div style={{ padding: "20px", color: "var(--jd-text-secondary)", lineHeight: 1.6 }}>
            Detailed finishing orders were not extracted for this weekend, so summary views are using available
            session, grid, fastest-lap, and championship data instead of full race-result sheets.
          </div>
        </div>
      )}

      {hasResultData && (
        <>
          {/* Strategy Insights */}
          <div className="jd-section">
            <div className="jd-section-header">
              <span className="jd-section-title">Strategy Insights</span>
            </div>
            <div style={{ padding: "20px" }}>
              <div className="jd-insights-grid">
                <div className="jd-insight-card green">
                  <div className="jd-insight-title">Early Short Lap (Lap 2)</div>
                  <div className="jd-insight-text">
                    Correlates with best finishes - used by {slLap2Winners.length} race winner{slLap2Winners.length !== 1 ? "s" : ""}
                    {slLap2Winners.length > 0 && ` (${slLap2Winners.map(w => w.race).join(", ")})`}
                  </div>
                </div>
                <div className="jd-insight-card blue">
                  <div className="jd-insight-title">Late Long Lap (Lap 5-6)</div>
                  <div className="jd-insight-text">
                    Shows strong results - winning strategy in {llLateWinners.length > 0
                      ? llLateWinners.map(w => w.race).join(", ")
                      : "no races"}
                  </div>
                </div>
                <div className="jd-insight-card red">
                  <div className="jd-insight-title">Late Short Lap (Lap 5-6)</div>
                  <div className="jd-insight-text">
                    {lateSLWinners.length === 0
                      ? "Tends to result in worse finishes - teams using this rarely won"
                      : `Used by ${lateSLWinners.length} winner${lateSLWinners.length !== 1 ? "s" : ""} but generally riskier`}
                  </div>
                </div>
                <div className="jd-insight-card purple">
                  <div className="jd-insight-title">Lap 1 Long Lap</div>
                  <div className="jd-insight-text">
                    {lap1LLRaces.length > 0
                      ? `In ${lap1LLRaces.map(r => r.title).join(", ")} showed mixed results - could be risky early strategy`
                      : "No teams used Lap 1 Long Lap strategy"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Position Gains Analysis */}
          <div className="jd-section">
            <div className="jd-section-header">
              <span className="jd-section-title">Total Position Gains Analysis</span>
              <div className="jd-view-toggle">
                <button className={`jd-toggle-btn ${gainsView === "pilot" ? "active" : ""}`} onClick={() => setGainsView("pilot")}>By Pilot</button>
                <button className={`jd-toggle-btn ${gainsView === "team" ? "active" : ""}`} onClick={() => setGainsView("team")}>By Team</button>
              </div>
            </div>
            {gainsView === "pilot" ? (
              <PilotGainsTable pilotGains={positionGains.pilotGains} expandedBreakdowns={expandedBreakdowns} toggleBreakdown={toggleBreakdown} />
            ) : (
              <TeamGainsTable teamGains={positionGains.teamGains} expandedBreakdowns={expandedBreakdowns} toggleBreakdown={toggleBreakdown} />
            )}
          </div>
        </>
      )}

      {/* Race Winners */}
      {hasResultData && raceWinners.length > 0 && (
        <div className="jd-section">
          <div className="jd-section-header">
            <span className="jd-section-title">Race Winners</span>
          </div>
          <div className="jd-winners-grid">
            {raceWinners.map((w, i) => (
              <div key={i} className="jd-winner-card">
                <div className="jd-winner-race">{w.race}</div>
                <div className="jd-winner-team">{w.team}</div>
                <div className="jd-winner-pilot">{w.pilot}</div>
                <div className="jd-winner-strategy">
                  SL:{w.sl}, LL:{w.ll}
                  {typeof w.start === "number" && w.start > 3 ? ` (from P${w.start}!)` : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Biggest Gainers */}
      {hasResultData && gainers.length > 0 && (
        <div className="jd-section">
          <div className="jd-section-header">
            <span className="jd-section-title">Biggest Position Gainers</span>
          </div>
          <table className="jd-data-table">
            <thead>
              <tr>
                <th>Race</th>
                <th>Driver</th>
                <th>Team</th>
                <th>Start &rarr; Finish</th>
                <th>Gained</th>
                <th>Strategy</th>
              </tr>
            </thead>
            <tbody>
              {gainers.map((g, i) => (
                <tr key={i}>
                  <td>{g.race}</td>
                  <td style={{ fontWeight: 600 }}>{g.pilot}</td>
                  <td style={{ color: "var(--jd-accent-green)" }}>{g.team}</td>
                  <td>P{g.start} &rarr; P{g.finish}</td>
                  <td className="jd-position-change jd-passed-positive">+{g.gained}</td>
                  <td className="jd-strategy-cell">SL: {g.sl}, LL: {g.ll}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Biggest Losers */}
      {hasResultData && losers.length > 0 && (
        <div className="jd-section">
          <div className="jd-section-header">
            <span className="jd-section-title">Biggest Position Losers</span>
          </div>
          <table className="jd-data-table">
            <thead>
              <tr>
                <th>Race</th>
                <th>Driver</th>
                <th>Team</th>
                <th>Start &rarr; Finish</th>
                <th>Lost</th>
                <th>Strategy</th>
              </tr>
            </thead>
            <tbody>
              {losers.map((g, i) => (
                <tr key={i}>
                  <td>{g.race}</td>
                  <td style={{ fontWeight: 600 }}>{g.pilot}</td>
                  <td style={{ color: "var(--jd-accent-green)" }}>{g.team}</td>
                  <td>P{g.start} &rarr; P{g.finish}</td>
                  <td className="jd-position-change jd-passed-negative">{g.gained}</td>
                  <td className="jd-strategy-cell">SL: {g.sl}, LL: {g.ll}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Fastest Laps */}
      {fastestLaps.length > 0 && (
        <div className="jd-section">
          <div className="jd-section-header">
            <span className="jd-section-title">Fastest Laps by Race</span>
          </div>
          <table className="jd-data-table">
            <thead>
              <tr>
                <th>Race</th>
                <th>Driver</th>
                <th>Team</th>
                <th>Time</th>
                <th>Lap</th>
                <th>Speed</th>
              </tr>
            </thead>
            <tbody>
              {fastestLaps.map((fl, i) => (
                <tr key={i} className={i === 0 ? "jd-fastest-row" : ""}>
                  <td style={{ fontWeight: 600 }}>{fl.race}</td>
                  <td>{fl.pilot}</td>
                  <td style={{ color: "var(--jd-accent-green)" }}>{fl.team}</td>
                  <td className={i === 0 ? "jd-fastest-time" : "jd-time-cell"}>{fl.time}</td>
                  <td>{fl.lap}</td>
                  <td style={{ color: "var(--jd-accent-cyan)" }}>{fl.kph} KPH</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Pilot Gains Table ──────────────────────────────────────────────────────

function PilotGainsTable({
  pilotGains, expandedBreakdowns, toggleBreakdown,
}: {
  pilotGains: Record<string, { total: number; team: string; penalties: number; breakdown: { race: string; gained: number | string; start: number | string; finish: number | string; penalty: string | null }[] }>;
  expandedBreakdowns: Set<string>;
  toggleBreakdown: (id: string) => void;
}) {
  const sorted = Object.entries(pilotGains).sort((a, b) => b[1].total - a[1].total);

  return (
    <table className="jd-gains-table">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Pilot</th>
          <th>Team</th>
          <th>Total +/-</th>
          <th>Penalties</th>
          <th>Races</th>
          <th>Breakdown</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map(([pilot, d], index) => {
          const cls = d.total > 0 ? "positive" : d.total < 0 ? "negative" : "neutral";
          const display = d.total > 0 ? `+${d.total}` : String(d.total);
          const bid = `pilot-${index}`;
          return (
            <React.Fragment key={pilot}>
              <tr>
                <td>{index + 1}</td>
                <td style={{ fontWeight: 600 }}>{pilot}</td>
                <td style={{ color: "var(--jd-accent-cyan)" }}>{d.team}</td>
                <td className={`jd-total-gains ${cls}`}>{display}</td>
                <td>{d.penalties > 0 ? <span style={{ color: "var(--jd-accent-red)" }}>{d.penalties}</span> : "0"}</td>
                <td>{d.breakdown.length}</td>
                <td>
                  <button type="button" className="jd-breakdown-toggle" onClick={() => toggleBreakdown(bid)}>
                    &#128202; View
                  </button>
                </td>
              </tr>
              {expandedBreakdowns.has(bid) && (
                <tr>
                  <td colSpan={7} style={{ padding: 0 }}>
                    <div className="jd-breakdown-content show">
                      {d.breakdown.map((b, bi) => (
                        <div key={bi}>
                          <div className="jd-breakdown-item">
                            <span>{b.race}{b.penalty ? " \u26A0\uFE0F" : ""}</span>
                            <span>P{b.start} &rarr; P{b.finish}</span>
                            <span className={typeof b.gained === "number" && b.gained > 0 ? "jd-passed-positive" : typeof b.gained === "number" && b.gained < 0 ? "jd-passed-negative" : ""}>
                              {typeof b.gained === "number" && b.gained > 0 ? "+" + b.gained : String(b.gained)}
                            </span>
                          </div>
                          {b.penalty && (
                            <div className="jd-breakdown-item" style={{ color: "var(--jd-accent-red)", fontSize: "0.8rem", paddingLeft: "10px" }}>
                              &#8629; {b.penalty}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Team Gains Table ───────────────────────────────────────────────────────

function TeamGainsTable({
  teamGains, expandedBreakdowns, toggleBreakdown,
}: {
  teamGains: Record<string, { total: number; penalties: number; breakdown: { race: string; pilot: string; gained: number | string; start: number | string; finish: number | string; penalty: string | null }[]; pilots: Record<string, { total: number; penalties: number }> }>;
  expandedBreakdowns: Set<string>;
  toggleBreakdown: (id: string) => void;
}) {
  const sorted = Object.entries(teamGains).sort((a, b) => b[1].total - a[1].total);

  return (
    <table className="jd-gains-table">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Team</th>
          <th>Total +/-</th>
          <th>Penalties</th>
          <th>Races</th>
          <th>Breakdown</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map(([team, d], index) => {
          const cls = d.total > 0 ? "positive" : d.total < 0 ? "negative" : "neutral";
          const display = d.total > 0 ? `+${d.total}` : String(d.total);
          const bid = `team-${index}`;
          return (
            <React.Fragment key={team}>
              <tr>
                <td>{index + 1}</td>
                <td style={{ fontWeight: 600, color: "var(--jd-accent-cyan)" }}>{team}</td>
                <td className={`jd-total-gains ${cls}`}>{display}</td>
                <td>{d.penalties > 0 ? <span style={{ color: "var(--jd-accent-red)" }}>{d.penalties}</span> : "0"}</td>
                <td>{d.breakdown.length}</td>
                <td>
                  <button type="button" className="jd-breakdown-toggle" onClick={() => toggleBreakdown(bid)}>
                    &#128202; View
                  </button>
                </td>
              </tr>
              {expandedBreakdowns.has(bid) && (
                <tr>
                  <td colSpan={6} style={{ padding: 0 }}>
                    <div className="jd-breakdown-content show">
                      <div style={{ marginBottom: "10px", fontWeight: 600, fontFamily: "'Poppins', sans-serif" }}>By Pilot:</div>
                      {Object.entries(d.pilots).map(([pilot, pd]) => (
                        <div key={pilot} className="jd-breakdown-item">
                          <span>{pilot}{pd.penalties > 0 ? " \u26A0\uFE0F" : ""}</span>
                          <span>
                            <span className={pd.total > 0 ? "jd-passed-positive" : pd.total < 0 ? "jd-passed-negative" : ""}>
                              {pd.total > 0 ? "+" + pd.total : pd.total}
                            </span>
                            {pd.penalties > 0 && <span style={{ color: "var(--jd-accent-red)", marginLeft: "10px" }}>({pd.penalties} penalty)</span>}
                          </span>
                        </div>
                      ))}
                      <div style={{ margin: "15px 0 10px 0", fontWeight: 600, borderTop: "1px solid var(--jd-border-color)", paddingTop: "10px", fontFamily: "'Poppins', sans-serif" }}>By Race:</div>
                      {d.breakdown.map((b, bi) => (
                        <div key={bi}>
                          <div className="jd-breakdown-item">
                            <span>{b.race} - {b.pilot}{b.penalty ? " \u26A0\uFE0F" : ""}</span>
                            <span>P{b.start} &rarr; P{b.finish}</span>
                            <span className={typeof b.gained === "number" && b.gained > 0 ? "jd-passed-positive" : typeof b.gained === "number" && b.gained < 0 ? "jd-passed-negative" : ""}>
                              {typeof b.gained === "number" && b.gained > 0 ? "+" + b.gained : String(b.gained)}
                            </span>
                          </div>
                          {b.penalty && (
                            <div className="jd-breakdown-item" style={{ color: "var(--jd-accent-red)", fontSize: "0.8rem", paddingLeft: "10px" }}>
                              &#8629; {b.penalty}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

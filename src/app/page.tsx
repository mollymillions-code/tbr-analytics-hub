"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AllData } from "@/lib/types";
import { getAllData, getRaceInfo } from "@/lib/data";
import { collectEventSessions, isRaceLikeSession, sortSeasons } from "@/lib/race";

export default function Home() {
  const [data, setData] = useState<AllData | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    getAllData()
      .then((d) => {
        if (!isMounted) return;
        setData(d);
        const seasons = sortSeasons(Object.keys(d.seasons));
        setSelectedSeason(seasons[seasons.length - 1] ?? null);
      })
      .catch((error: unknown) => {
        if (!isMounted) return;
        setLoadError(error instanceof Error ? error.message : "Failed to load analytics data.");
      });

    return () => {
      isMounted = false;
    };
  }, []);

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

  const seasons = sortSeasons(Object.keys(data.seasons));

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold tracking-wider mb-1">E1 RACE ANALYTICS</h1>
        <p className="text-[var(--text-secondary)] text-sm mb-6">
          Performance data across {seasons.length} seasons — Team Blue Rising, E1 World Championship
        </p>
        <div className="flex gap-3 flex-wrap">
          {seasons.map((season) => (
            <button
              key={season}
              onClick={() => setSelectedSeason(season)}
              className={`px-5 py-3 rounded-lg font-semibold text-sm uppercase tracking-wider border-2 transition-all cursor-pointer ${
                selectedSeason === season
                  ? "bg-[var(--accent-cyan)] border-[var(--accent-cyan)] text-white"
                  : "bg-[var(--bg-card)] border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--accent-cyan)] hover:text-[var(--accent-cyan)]"
              }`}
            >
              {season}
            </button>
          ))}
        </div>
      </div>

      {selectedSeason && (
        <div>
          <div className="flex items-center gap-3 mb-5">
            <h2 className="font-display text-lg font-bold tracking-wider text-[var(--accent-cyan)]">
              {selectedSeason.toUpperCase()}
            </h2>
            <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-card)] px-3 py-1 rounded-full border border-[var(--border-color)]">
              {Object.keys(data.seasons[selectedSeason].races).length} ROUNDS
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Object.entries(data.seasons[selectedSeason].races).map(([raceName, raceData]) => {
              const info = getRaceInfo(raceName);
              const sessions = collectEventSessions(raceData.events);
              const totalSessions = sessions.length;
              const raceSessions = sessions.filter((session) => isRaceLikeSession(session.title));
              const roundNumber = raceName.match(/R(\d+)/)?.[1] || "?";
              const location = raceName.replace(/^R\d+\s+/, "");

              const tbrResults = sessions.flatMap((session) =>
                session.classification?.results.filter((result) => result.team?.toLowerCase().includes("blue rising")) ?? []
              );
              const tbrBestFinish = tbrResults.length > 0
                ? Math.min(...tbrResults.filter((r) => typeof r.pos === "number").map((r) => r.pos as number))
                : null;

              return (
                <Link
                  key={raceName}
                  href={`/race/${encodeURIComponent(selectedSeason)}/${encodeURIComponent(raceName)}`}
                  className="race-card block bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden"
                >
                  <div className="h-1 bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-green)]" />
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="text-xs text-[var(--text-muted)] uppercase tracking-widest mb-1">
                          Round {roundNumber}
                        </div>
                        <div className="font-display text-lg font-bold tracking-wide">{location}</div>
                      </div>
                      <span className="text-2xl">{info.emoji}</span>
                    </div>
                    <div className="text-xs text-[var(--text-muted)] mb-4">{info.country}</div>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="bg-[rgba(0,85,212,0.06)] rounded-lg p-2.5 text-center">
                        <div className="font-numbers text-lg font-bold text-[var(--accent-cyan)]">{totalSessions}</div>
                        <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Sessions</div>
                      </div>
                      <div className="bg-[rgba(0,135,90,0.06)] rounded-lg p-2.5 text-center">
                        <div className="font-numbers text-lg font-bold text-[var(--accent-green)]">{raceSessions.length}</div>
                        <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Races</div>
                      </div>
                    </div>
                    {tbrBestFinish && (
                      <div className="bg-[rgba(0,85,212,0.08)] border border-[rgba(0,85,212,0.2)] rounded-lg px-3 py-2 text-center">
                        <span className="text-xs text-[var(--text-muted)]">TBR Best: </span>
                        <span className="font-numbers font-bold text-sm text-[var(--accent-cyan)]">P{tbrBestFinish}</span>
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

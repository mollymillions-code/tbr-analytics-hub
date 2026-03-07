import { getDb } from "@/lib/db";
import { getSessionType } from "@/lib/race";
import type {
  AllData,
  ClassificationDoc,
  AnalysisDoc,
  ChampionshipDoc,
} from "@/lib/types";

function timeToSeconds(t: string | null | undefined): number | null {
  if (!t) return null;
  const parts = t.split(":");
  if (parts.length === 3) return +parts[0] * 3600 + +parts[1] * 60 + +parts[2];
  if (parts.length === 2) return +parts[0] * 60 + +parts[1];
  const num = parseFloat(parts[0]);
  return isNaN(num) ? null : num;
}

export async function seedDataFromJson(data: AllData): Promise<{
  races: number;
  sessions: number;
  results: number;
  laps: number;
  championships: number;
}> {
  const sql = getDb();
  const counts = { races: 0, sessions: 0, results: 0, laps: 0, championships: 0 };

  // Clear existing data (idempotent reload)
  await sql`DELETE FROM e1_laps`;
  await sql`DELETE FROM e1_results`;
  await sql`DELETE FROM e1_sessions`;
  await sql`DELETE FROM e1_championships`;
  await sql`DELETE FROM e1_races`;

  for (const [season, sData] of Object.entries(data.seasons)) {
    for (const [race, rData] of Object.entries(sData.races)) {
      // Extract location from first doc that has one
      let location = "";
      for (const docs of Object.values(rData.events)) {
        for (const doc of docs) {
          if ("location" in doc && doc.location) {
            location = doc.location;
            break;
          }
        }
        if (location) break;
      }

      // Insert race
      const raceRows = await sql`
        INSERT INTO e1_races (season, race, location)
        VALUES (${season}, ${race}, ${location})
        ON CONFLICT (season, race) DO UPDATE SET location = ${location}
        RETURNING id
      `;
      const raceId = raceRows[0].id;
      counts.races++;

      // Process event documents
      for (const [eventPath, docs] of Object.entries(rData.events)) {
        for (const doc of docs) {
          if (doc.type === "classification") {
            await insertClassification(sql, raceId, eventPath, doc as ClassificationDoc, counts);
          } else if (doc.type === "analysis") {
            await insertAnalysis(sql, raceId, eventPath, doc as AnalysisDoc, counts);
          } else if (doc.type === "championship") {
            await insertChampionship(sql, raceId, doc as ChampionshipDoc, counts);
          }
        }
      }
    }
  }

  return counts;
}

async function insertClassification(
  sql: ReturnType<typeof getDb>,
  raceId: number,
  eventPath: string,
  doc: ClassificationDoc,
  counts: { sessions: number; results: number }
) {
  if (!doc.results || doc.results.length === 0) return;

  const sessionName = doc.session || eventPath.split("/").pop() || eventPath;
  const sessionType = getSessionType(sessionName);

  const sessionRows = await sql`
    INSERT INTO e1_sessions (
      race_id, session_name, session_type, laps, distance, wind, race_date,
      fl_pilot, fl_time, fl_kph, fl_lap, source_file
    )
    VALUES (
      ${raceId}, ${sessionName}, ${sessionType},
      ${doc.laps ?? null}, ${doc.distance || null}, ${doc.wind || null}, ${doc.date || null},
      ${doc.fastest_lap?.pilot ?? null}, ${doc.fastest_lap?.time ?? null},
      ${doc.fastest_lap?.kph ?? null}, ${doc.fastest_lap?.lap ?? null},
      ${doc.source_file || null}
    )
    ON CONFLICT (race_id, session_name) DO UPDATE SET
      laps = COALESCE(EXCLUDED.laps, e1_sessions.laps),
      distance = COALESCE(EXCLUDED.distance, e1_sessions.distance),
      wind = COALESCE(EXCLUDED.wind, e1_sessions.wind),
      race_date = COALESCE(EXCLUDED.race_date, e1_sessions.race_date),
      fl_pilot = COALESCE(EXCLUDED.fl_pilot, e1_sessions.fl_pilot),
      fl_time = COALESCE(EXCLUDED.fl_time, e1_sessions.fl_time),
      fl_kph = COALESCE(EXCLUDED.fl_kph, e1_sessions.fl_kph),
      fl_lap = COALESCE(EXCLUDED.fl_lap, e1_sessions.fl_lap)
    RETURNING id
  `;

  const sessionId = sessionRows[0].id;
  counts.sessions++;

  for (const r of doc.results) {
    await sql`
      INSERT INTO e1_results (
        session_id, pos, pilot, team, boat_no, racebird,
        total_time, gap, kph, best_lap_time, best_lap_num, note
      )
      VALUES (
        ${sessionId}, ${String(r.pos)}, ${r.pilot}, ${r.team || ''},
        ${r.no || null}, ${r.racebird || null},
        ${r.total_time || null}, ${r.gap || null}, ${r.kph ?? null},
        ${r.best_lap?.time ?? null}, ${r.best_lap?.lap ?? null}, ${r.note || null}
      )
    `;
    counts.results++;
  }
}

async function insertAnalysis(
  sql: ReturnType<typeof getDb>,
  raceId: number,
  eventPath: string,
  doc: AnalysisDoc,
  counts: { sessions: number; laps: number }
) {
  if (!doc.teams || doc.teams.length === 0) return;

  const sessionName = doc.session || eventPath.split("/").pop() || eventPath;
  const sessionType = getSessionType(sessionName);

  // Find or create session (may already exist from classification)
  let sessionId: number;
  const existing = await sql`
    SELECT id FROM e1_sessions
    WHERE race_id = ${raceId} AND session_name = ${sessionName}
    LIMIT 1
  `;

  if (existing.length > 0) {
    sessionId = existing[0].id;
  } else {
    const sessionRows = await sql`
      INSERT INTO e1_sessions (race_id, session_name, session_type, source_file)
      VALUES (${raceId}, ${sessionName}, ${sessionType}, ${doc.source_file || null})
      ON CONFLICT (race_id, session_name) DO NOTHING
      RETURNING id
    `;
    if (sessionRows.length === 0) {
      // Race condition — try to find it again
      const retry = await sql`
        SELECT id FROM e1_sessions
        WHERE race_id = ${raceId} AND session_name = ${sessionName} LIMIT 1
      `;
      if (retry.length === 0) return;
      sessionId = retry[0].id;
    } else {
      sessionId = sessionRows[0].id;
    }
    counts.sessions++;
  }

  for (const team of doc.teams) {
    const pilotsStr = team.pilots?.join(", ") || "";
    for (const lap of team.laps) {
      await sql`
        INSERT INTO e1_laps (
          session_id, team, pilots, lap_num, lap_time, lap_time_sec,
          sector1, sector2, sector3, kph, marker, elapsed
        )
        VALUES (
          ${sessionId}, ${team.team}, ${pilotsStr}, ${lap.lap},
          ${lap.time || null}, ${timeToSeconds(lap.time)},
          ${lap.sector1 ?? null}, ${lap.sector2 ?? null}, ${lap.sector3 ?? null},
          ${lap.kph ?? null}, ${lap.marker || null}, ${lap.elapsed || null}
        )
      `;
      counts.laps++;
    }
  }
}

async function insertChampionship(
  sql: ReturnType<typeof getDb>,
  raceId: number,
  doc: ChampionshipDoc,
  counts: { championships: number }
) {
  if (!doc.standings || doc.standings.length === 0) return;

  for (const s of doc.standings) {
    await sql`
      INSERT INTO e1_championships (race_id, team, pos, points)
      VALUES (${raceId}, ${s.team}, ${s.pos}, ${s.points})
    `;
    counts.championships++;
  }
}

import { neon } from "@neondatabase/serverless";

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not configured");
  return neon(url);
}

// ─── Schema: all tables ────────────────────────────────────────────────────

export async function initAllTables() {
  const sql = getDb();

  // Saved reports (already deployed)
  await sql`
    CREATE TABLE IF NOT EXISTS canvas_reports (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      query TEXT NOT NULL,
      result JSONB NOT NULL,
      saved_by TEXT NOT NULL DEFAULT 'team',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // ── Normalized race data ──

  await sql`
    CREATE TABLE IF NOT EXISTS e1_races (
      id SERIAL PRIMARY KEY,
      season TEXT NOT NULL,
      race TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT '',
      UNIQUE(season, race)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS e1_sessions (
      id SERIAL PRIMARY KEY,
      race_id INT NOT NULL REFERENCES e1_races(id) ON DELETE CASCADE,
      session_name TEXT NOT NULL,
      session_type TEXT NOT NULL DEFAULT 'other',
      laps INT,
      distance TEXT,
      wind TEXT,
      race_date TEXT,
      fl_pilot TEXT,
      fl_time TEXT,
      fl_kph NUMERIC,
      fl_lap INT,
      source_file TEXT,
      UNIQUE(race_id, session_name, source_file)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS e1_results (
      id SERIAL PRIMARY KEY,
      session_id INT NOT NULL REFERENCES e1_sessions(id) ON DELETE CASCADE,
      pos TEXT NOT NULL,
      pilot TEXT NOT NULL,
      team TEXT NOT NULL DEFAULT '',
      boat_no TEXT,
      racebird TEXT,
      total_time TEXT,
      gap TEXT,
      kph NUMERIC,
      best_lap_time TEXT,
      best_lap_num INT,
      note TEXT
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS e1_laps (
      id SERIAL PRIMARY KEY,
      session_id INT NOT NULL REFERENCES e1_sessions(id) ON DELETE CASCADE,
      team TEXT NOT NULL,
      pilots TEXT NOT NULL DEFAULT '',
      lap_num INT NOT NULL,
      lap_time TEXT,
      lap_time_sec NUMERIC,
      sector1 NUMERIC,
      sector2 NUMERIC,
      sector3 NUMERIC,
      kph NUMERIC,
      marker TEXT,
      elapsed TEXT
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS e1_championships (
      id SERIAL PRIMARY KEY,
      race_id INT NOT NULL REFERENCES e1_races(id) ON DELETE CASCADE,
      team TEXT NOT NULL,
      pos INT NOT NULL,
      points NUMERIC NOT NULL
    )
  `;

  // ── Formula library ──

  await sql`
    CREATE TABLE IF NOT EXISTS canvas_formulas (
      id SERIAL PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL DEFAULT 'general',
      sql_template TEXT NOT NULL,
      param_names TEXT[] NOT NULL DEFAULT '{}',
      usage_count INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // Indexes for fast compute queries
  await sql`CREATE INDEX IF NOT EXISTS idx_e1_results_team ON e1_results(team)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_e1_results_pilot ON e1_results(pilot)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_e1_results_session ON e1_results(session_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_e1_laps_session ON e1_laps(session_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_e1_laps_team ON e1_laps(team)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_e1_sessions_race ON e1_sessions(race_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_e1_championships_race ON e1_championships(race_id)`;
}

// Legacy alias
export const initReportsTable = initAllTables;

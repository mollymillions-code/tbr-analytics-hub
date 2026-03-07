import { getDb } from "@/lib/db";

// ─── Formula Definitions ──────────────────────────────────────────────────
// Each formula is a parameterized SQL query that returns verified data.
// Parameters use $1, $2 etc. — NULL means "all" (no filter).

export interface FormulaDefinition {
  slug: string;
  name: string;
  description: string;
  category: string;
  sql_template: string;
  param_names: string[];
}

export const SEED_FORMULAS: FormulaDefinition[] = [
  // ── Performance ──
  {
    slug: "team_finish_positions",
    name: "Team Finish Positions",
    description: "Average, best, worst finish position per team across race sessions",
    category: "performance",
    param_names: ["team_filter", "season_filter"],
    sql_template: `
      SELECT r.team,
        COUNT(*) AS race_count,
        ROUND(AVG(r.pos::numeric), 2) AS avg_position,
        ROUND(STDDEV(r.pos::numeric), 2) AS position_stddev,
        MIN(r.pos::int) AS best_finish,
        MAX(r.pos::int) AS worst_finish,
        COUNT(*) FILTER (WHERE r.pos::int = 1) AS wins,
        COUNT(*) FILTER (WHERE r.pos::int <= 3) AS podiums
      FROM e1_results r
      JOIN e1_sessions s ON r.session_id = s.id
      JOIN e1_races rc ON s.race_id = rc.id
      WHERE r.pos ~ '^[0-9]+$'
        AND s.session_type IN ('race','semifinal','final','placerace','raceoff')
        AND ($1::text IS NULL OR LOWER(r.team) LIKE '%' || LOWER($1) || '%')
        AND ($2::text IS NULL OR rc.season = $2)
      GROUP BY r.team
      ORDER BY avg_position
    `,
  },
  {
    slug: "pilot_finish_positions",
    name: "Pilot Finish Positions",
    description: "Average, best, worst finish per pilot in race sessions",
    category: "performance",
    param_names: ["team_filter", "season_filter"],
    sql_template: `
      SELECT r.pilot, r.team,
        COUNT(*) AS race_count,
        ROUND(AVG(r.pos::numeric), 2) AS avg_position,
        MIN(r.pos::int) AS best_finish,
        MAX(r.pos::int) AS worst_finish,
        COUNT(*) FILTER (WHERE r.pos::int = 1) AS wins,
        COUNT(*) FILTER (WHERE r.pos::int <= 3) AS podiums
      FROM e1_results r
      JOIN e1_sessions s ON r.session_id = s.id
      JOIN e1_races rc ON s.race_id = rc.id
      WHERE r.pos ~ '^[0-9]+$'
        AND s.session_type IN ('race','semifinal','final','placerace','raceoff')
        AND ($1::text IS NULL OR LOWER(r.team) LIKE '%' || LOWER($1) || '%')
        AND ($2::text IS NULL OR rc.season = $2)
      GROUP BY r.pilot, r.team
      ORDER BY avg_position
    `,
  },
  {
    slug: "team_results_by_race",
    name: "Team Results Race by Race",
    description: "Finish position for each team in every race session, chronological",
    category: "performance",
    param_names: ["team_filter", "season_filter"],
    sql_template: `
      SELECT rc.season, rc.race, s.session_name, s.session_type,
        r.pos, r.pilot, r.team, r.total_time, r.gap, r.kph
      FROM e1_results r
      JOIN e1_sessions s ON r.session_id = s.id
      JOIN e1_races rc ON s.race_id = rc.id
      WHERE r.pos ~ '^[0-9]+$'
        AND s.session_type IN ('race','semifinal','final','placerace','raceoff')
        AND ($1::text IS NULL OR LOWER(r.team) LIKE '%' || LOWER($1) || '%')
        AND ($2::text IS NULL OR rc.season = $2)
      ORDER BY rc.season, rc.race, s.session_name, r.pos::int
    `,
  },

  // ── Speed & Lap Times ──
  {
    slug: "fastest_laps_by_pilot",
    name: "Fastest Laps by Pilot",
    description: "Session fastest lap awards per pilot with best time and speed",
    category: "speed",
    param_names: ["team_filter", "season_filter"],
    sql_template: `
      SELECT s.fl_pilot AS pilot,
        COUNT(*) AS fastest_lap_count,
        MIN(s.fl_time) AS best_time,
        MAX(s.fl_kph) AS top_kph
      FROM e1_sessions s
      JOIN e1_races rc ON s.race_id = rc.id
      WHERE s.fl_pilot IS NOT NULL
        AND ($1::text IS NULL OR LOWER(s.fl_pilot) IN (
          SELECT LOWER(r2.pilot) FROM e1_results r2
          WHERE LOWER(r2.team) LIKE '%' || LOWER($1) || '%'
        ))
        AND ($2::text IS NULL OR rc.season = $2)
      GROUP BY s.fl_pilot
      ORDER BY fastest_lap_count DESC
    `,
  },
  {
    slug: "lap_time_stats_by_team",
    name: "Lap Time Statistics by Team",
    description: "Average, best, worst lap times and consistency per team",
    category: "speed",
    param_names: ["team_filter", "season_filter"],
    sql_template: `
      SELECT l.team,
        COUNT(*) AS total_laps,
        ROUND(AVG(l.lap_time_sec), 3) AS avg_lap_sec,
        ROUND(MIN(l.lap_time_sec), 3) AS best_lap_sec,
        ROUND(MAX(l.lap_time_sec), 3) AS worst_lap_sec,
        ROUND(STDDEV(l.lap_time_sec), 3) AS lap_consistency,
        ROUND(AVG(l.kph), 1) AS avg_kph,
        ROUND(MAX(l.kph), 1) AS peak_kph
      FROM e1_laps l
      JOIN e1_sessions s ON l.session_id = s.id
      JOIN e1_races rc ON s.race_id = rc.id
      WHERE l.lap_time_sec IS NOT NULL
        AND l.lap_time_sec > 0
        AND ($1::text IS NULL OR LOWER(l.team) LIKE '%' || LOWER($1) || '%')
        AND ($2::text IS NULL OR rc.season = $2)
      GROUP BY l.team
      ORDER BY avg_lap_sec
    `,
  },
  {
    slug: "lap_times_by_race",
    name: "Lap Times Per Race",
    description: "Average lap time per team per race for trend analysis",
    category: "speed",
    param_names: ["team_filter", "season_filter"],
    sql_template: `
      SELECT rc.season, rc.race, l.team,
        COUNT(*) AS lap_count,
        ROUND(AVG(l.lap_time_sec), 3) AS avg_lap_sec,
        ROUND(MIN(l.lap_time_sec), 3) AS best_lap_sec,
        ROUND(STDDEV(l.lap_time_sec), 3) AS consistency
      FROM e1_laps l
      JOIN e1_sessions s ON l.session_id = s.id
      JOIN e1_races rc ON s.race_id = rc.id
      WHERE l.lap_time_sec IS NOT NULL AND l.lap_time_sec > 0
        AND s.session_type IN ('race','semifinal','final','placerace','raceoff')
        AND ($1::text IS NULL OR LOWER(l.team) LIKE '%' || LOWER($1) || '%')
        AND ($2::text IS NULL OR rc.season = $2)
      GROUP BY rc.season, rc.race, l.team
      ORDER BY rc.season, rc.race, avg_lap_sec
    `,
  },

  // ── Penalties ──
  {
    slug: "penalty_summary",
    name: "Penalty Summary by Team",
    description: "Short lap (SL) and long lap (LL) counts and rates per team",
    category: "penalties",
    param_names: ["team_filter", "season_filter"],
    sql_template: `
      SELECT l.team,
        COUNT(*) AS total_laps,
        COUNT(*) FILTER (WHERE l.marker = 'SL') AS short_laps,
        COUNT(*) FILTER (WHERE l.marker = 'LL') AS long_laps,
        ROUND(COUNT(*) FILTER (WHERE l.marker = 'SL')::numeric / NULLIF(COUNT(*), 0) * 100, 2) AS sl_pct,
        ROUND(COUNT(*) FILTER (WHERE l.marker = 'LL')::numeric / NULLIF(COUNT(*), 0) * 100, 2) AS ll_pct,
        ROUND(COUNT(*)::numeric / NULLIF(COUNT(*) FILTER (WHERE l.marker = 'LL'), 0), 1) AS laps_per_ll
      FROM e1_laps l
      JOIN e1_sessions s ON l.session_id = s.id
      JOIN e1_races rc ON s.race_id = rc.id
      WHERE ($1::text IS NULL OR LOWER(l.team) LIKE '%' || LOWER($1) || '%')
        AND ($2::text IS NULL OR rc.season = $2)
      GROUP BY l.team
      ORDER BY ll_pct DESC
    `,
  },
  {
    slug: "penalty_trend_by_race",
    name: "Penalty Trend by Race",
    description: "SL and LL counts per race to show penalty trends over time",
    category: "penalties",
    param_names: ["team_filter", "season_filter"],
    sql_template: `
      SELECT rc.season, rc.race, l.team,
        COUNT(*) AS total_laps,
        COUNT(*) FILTER (WHERE l.marker = 'SL') AS short_laps,
        COUNT(*) FILTER (WHERE l.marker = 'LL') AS long_laps
      FROM e1_laps l
      JOIN e1_sessions s ON l.session_id = s.id
      JOIN e1_races rc ON s.race_id = rc.id
      WHERE ($1::text IS NULL OR LOWER(l.team) LIKE '%' || LOWER($1) || '%')
        AND ($2::text IS NULL OR rc.season = $2)
      GROUP BY rc.season, rc.race, l.team
      ORDER BY rc.season, rc.race
    `,
  },

  // ── Sectors ──
  {
    slug: "sector_averages",
    name: "Sector Time Averages by Team",
    description: "Average sector 1, 2, 3 times per team with delta to fastest",
    category: "sectors",
    param_names: ["team_filter", "season_filter"],
    sql_template: `
      WITH team_sectors AS (
        SELECT l.team,
          ROUND(AVG(l.sector1), 3) AS avg_s1,
          ROUND(AVG(l.sector2), 3) AS avg_s2,
          ROUND(AVG(l.sector3), 3) AS avg_s3,
          ROUND(AVG(l.sector1) + AVG(l.sector2) + AVG(l.sector3), 3) AS avg_total
        FROM e1_laps l
        JOIN e1_sessions s ON l.session_id = s.id
        JOIN e1_races rc ON s.race_id = rc.id
        WHERE l.sector1 IS NOT NULL AND l.sector2 IS NOT NULL AND l.sector3 IS NOT NULL
          AND s.session_type IN ('race','semifinal','final','placerace','raceoff')
          AND ($1::text IS NULL OR LOWER(l.team) LIKE '%' || LOWER($1) || '%')
          AND ($2::text IS NULL OR rc.season = $2)
        GROUP BY l.team
      ),
      best AS (
        SELECT MIN(avg_s1) AS best_s1, MIN(avg_s2) AS best_s2, MIN(avg_s3) AS best_s3
        FROM team_sectors
      )
      SELECT ts.*,
        ROUND(ts.avg_s1 - b.best_s1, 3) AS delta_s1,
        ROUND(ts.avg_s2 - b.best_s2, 3) AS delta_s2,
        ROUND(ts.avg_s3 - b.best_s3, 3) AS delta_s3
      FROM team_sectors ts, best b
      ORDER BY avg_total
    `,
  },
  {
    slug: "sector_by_race",
    name: "Sector Times Per Race",
    description: "Average sector times per race for trend tracking",
    category: "sectors",
    param_names: ["team_filter", "season_filter"],
    sql_template: `
      SELECT rc.season, rc.race, l.team,
        ROUND(AVG(l.sector1), 3) AS avg_s1,
        ROUND(AVG(l.sector2), 3) AS avg_s2,
        ROUND(AVG(l.sector3), 3) AS avg_s3
      FROM e1_laps l
      JOIN e1_sessions s ON l.session_id = s.id
      JOIN e1_races rc ON s.race_id = rc.id
      WHERE l.sector1 IS NOT NULL AND l.sector2 IS NOT NULL AND l.sector3 IS NOT NULL
        AND s.session_type IN ('race','semifinal','final','placerace','raceoff')
        AND ($1::text IS NULL OR LOWER(l.team) LIKE '%' || LOWER($1) || '%')
        AND ($2::text IS NULL OR rc.season = $2)
      GROUP BY rc.season, rc.race, l.team
      ORDER BY rc.season, rc.race
    `,
  },

  // ── Championship ──
  {
    slug: "championship_standings",
    name: "Championship Standings",
    description: "Latest championship standings per season with points",
    category: "championship",
    param_names: ["team_filter", "season_filter"],
    sql_template: `
      WITH latest_race AS (
        SELECT DISTINCT ON (rc.season) rc.id AS race_id, rc.season, rc.race
        FROM e1_championships c
        JOIN e1_races rc ON c.race_id = rc.id
        WHERE ($2::text IS NULL OR rc.season = $2)
        ORDER BY rc.season, rc.race DESC
      )
      SELECT lr.season, lr.race AS after_race, c.team, c.pos, c.points
      FROM e1_championships c
      JOIN latest_race lr ON c.race_id = lr.race_id
      WHERE ($1::text IS NULL OR LOWER(c.team) LIKE '%' || LOWER($1) || '%')
      ORDER BY lr.season, c.pos
    `,
  },
  {
    slug: "championship_progression",
    name: "Championship Points Progression",
    description: "Points after each race for trajectory analysis",
    category: "championship",
    param_names: ["team_filter", "season_filter"],
    sql_template: `
      SELECT rc.season, rc.race, c.team, c.pos, c.points
      FROM e1_championships c
      JOIN e1_races rc ON c.race_id = rc.id
      WHERE ($1::text IS NULL OR LOWER(c.team) LIKE '%' || LOWER($1) || '%')
        AND ($2::text IS NULL OR rc.season = $2)
      ORDER BY rc.season, rc.race, c.pos
    `,
  },

  // ── Comparison ──
  {
    slug: "head_to_head",
    name: "Head-to-Head Comparison",
    description: "Direct comparison of two teams in shared race sessions",
    category: "comparison",
    param_names: ["team_filter", "team_filter_2"],
    sql_template: `
      WITH team_results AS (
        SELECT s.id AS session_id, rc.season, rc.race, s.session_name,
          r.team, r.pos::int AS pos, r.pilot
        FROM e1_results r
        JOIN e1_sessions s ON r.session_id = s.id
        JOIN e1_races rc ON s.race_id = rc.id
        WHERE r.pos ~ '^[0-9]+$'
          AND s.session_type IN ('race','semifinal','final','placerace','raceoff')
          AND (LOWER(r.team) LIKE '%' || LOWER($1) || '%' OR LOWER(r.team) LIKE '%' || LOWER($2) || '%')
      )
      SELECT t1.season, t1.race, t1.session_name,
        t1.team AS team_a, t1.pos AS pos_a, t1.pilot AS pilot_a,
        t2.team AS team_b, t2.pos AS pos_b, t2.pilot AS pilot_b,
        t2.pos - t1.pos AS pos_delta
      FROM team_results t1
      JOIN team_results t2 ON t1.session_id = t2.session_id
        AND LOWER(t1.team) LIKE '%' || LOWER($1) || '%'
        AND LOWER(t2.team) LIKE '%' || LOWER($2) || '%'
      ORDER BY t1.season, t1.race, t1.session_name
    `,
  },

  // ── DNFs ──
  {
    slug: "dnf_analysis",
    name: "DNF and Non-Finish Analysis",
    description: "Non-numeric finishes (DNF, DNS, DSQ) per team",
    category: "performance",
    param_names: ["team_filter", "season_filter"],
    sql_template: `
      SELECT r.team, r.pos AS status, r.pilot,
        rc.season, rc.race, s.session_name, r.note
      FROM e1_results r
      JOIN e1_sessions s ON r.session_id = s.id
      JOIN e1_races rc ON s.race_id = rc.id
      WHERE r.pos !~ '^[0-9]+$'
        AND s.session_type IN ('race','semifinal','final','placerace','raceoff')
        AND ($1::text IS NULL OR LOWER(r.team) LIKE '%' || LOWER($1) || '%')
        AND ($2::text IS NULL OR rc.season = $2)
      ORDER BY rc.season, rc.race
    `,
  },

  // ── Grid / Qualifying vs Race ──
  {
    slug: "qualifying_vs_race",
    name: "Qualifying vs Race Performance",
    description: "Compares qualifying position to race finish for position gain/loss analysis",
    category: "performance",
    param_names: ["team_filter", "season_filter"],
    sql_template: `
      WITH qual AS (
        SELECT s.race_id, r.team, r.pilot, MIN(r.pos::int) AS qual_pos
        FROM e1_results r
        JOIN e1_sessions s ON r.session_id = s.id
        WHERE r.pos ~ '^[0-9]+$' AND s.session_type = 'qualifying'
        GROUP BY s.race_id, r.team, r.pilot
      ),
      race AS (
        SELECT s.race_id, r.team, r.pilot, MIN(r.pos::int) AS race_pos
        FROM e1_results r
        JOIN e1_sessions s ON r.session_id = s.id
        WHERE r.pos ~ '^[0-9]+$' AND s.session_type IN ('race','semifinal','final')
        GROUP BY s.race_id, r.team, r.pilot
      )
      SELECT rc.season, rc.race, q.team, q.pilot,
        q.qual_pos, r.race_pos, q.qual_pos - r.race_pos AS places_gained
      FROM qual q
      JOIN race r ON q.race_id = r.race_id AND q.pilot = r.pilot
      JOIN e1_races rc ON q.race_id = rc.id
      WHERE ($1::text IS NULL OR LOWER(q.team) LIKE '%' || LOWER($1) || '%')
        AND ($2::text IS NULL OR rc.season = $2)
      ORDER BY rc.season, rc.race, places_gained DESC
    `,
  },

  // ── Overview ──
  {
    slug: "grid_overview",
    name: "Grid Overview",
    description: "All teams and pilots with their total race entries",
    category: "overview",
    param_names: ["season_filter"],
    sql_template: `
      SELECT r.team,
        array_agg(DISTINCT r.pilot) AS pilots,
        COUNT(DISTINCT s.id) AS session_count,
        COUNT(DISTINCT rc.id) AS race_weekend_count
      FROM e1_results r
      JOIN e1_sessions s ON r.session_id = s.id
      JOIN e1_races rc ON s.race_id = rc.id
      WHERE s.session_type IN ('race','semifinal','final','placerace','raceoff')
        AND ($1::text IS NULL OR rc.season = $1)
      GROUP BY r.team
      ORDER BY race_weekend_count DESC, r.team
    `,
  },
  {
    slug: "season_summary",
    name: "Season Summary",
    description: "High-level stats per season: race count, session count, teams, laps analyzed",
    category: "overview",
    param_names: ["season_filter"],
    sql_template: `
      SELECT rc.season,
        COUNT(DISTINCT rc.id) AS race_count,
        COUNT(DISTINCT s.id) AS session_count,
        COUNT(DISTINCT r.team) AS team_count,
        COUNT(DISTINCT r.pilot) AS pilot_count
      FROM e1_results r
      JOIN e1_sessions s ON r.session_id = s.id
      JOIN e1_races rc ON s.race_id = rc.id
      WHERE s.session_type IN ('race','semifinal','final','placerace','raceoff')
        AND ($1::text IS NULL OR rc.season = $1)
      GROUP BY rc.season
      ORDER BY rc.season
    `,
  },

  // ── Speed records ──
  {
    slug: "speed_records",
    name: "Top Speed Records",
    description: "Fastest lap times and highest KPH across all sessions",
    category: "speed",
    param_names: ["team_filter", "season_filter"],
    sql_template: `
      SELECT rc.season, rc.race, s.session_name,
        s.fl_pilot AS pilot, s.fl_time AS lap_time, s.fl_kph AS kph, s.fl_lap AS lap_number
      FROM e1_sessions s
      JOIN e1_races rc ON s.race_id = rc.id
      WHERE s.fl_pilot IS NOT NULL AND s.fl_kph IS NOT NULL
        AND ($1::text IS NULL OR LOWER(s.fl_pilot) IN (
          SELECT LOWER(r2.pilot) FROM e1_results r2
          WHERE LOWER(r2.team) LIKE '%' || LOWER($1) || '%'
        ))
        AND ($2::text IS NULL OR rc.season = $2)
      ORDER BY s.fl_kph DESC
      LIMIT 30
    `,
  },

  // ── Race pace consistency ──
  {
    slug: "race_pace_consistency",
    name: "Race Pace Consistency",
    description: "Lap time variance within each race session per team (lower = more consistent)",
    category: "speed",
    param_names: ["team_filter", "season_filter"],
    sql_template: `
      SELECT rc.season, rc.race, s.session_name, l.team,
        COUNT(*) AS lap_count,
        ROUND(AVG(l.lap_time_sec), 3) AS avg_lap,
        ROUND(STDDEV(l.lap_time_sec), 3) AS lap_stddev,
        ROUND(MIN(l.lap_time_sec), 3) AS fastest,
        ROUND(MAX(l.lap_time_sec), 3) AS slowest,
        ROUND(MAX(l.lap_time_sec) - MIN(l.lap_time_sec), 3) AS spread
      FROM e1_laps l
      JOIN e1_sessions s ON l.session_id = s.id
      JOIN e1_races rc ON s.race_id = rc.id
      WHERE l.lap_time_sec IS NOT NULL AND l.lap_time_sec > 0
        AND s.session_type IN ('race','semifinal','final','placerace','raceoff')
        AND l.marker IS NULL OR l.marker = '__'
        AND ($1::text IS NULL OR LOWER(l.team) LIKE '%' || LOWER($1) || '%')
        AND ($2::text IS NULL OR rc.season = $2)
      GROUP BY rc.season, rc.race, s.session_name, l.team
      HAVING COUNT(*) >= 3
      ORDER BY lap_stddev
    `,
  },
];

export async function seedFormulas() {
  const sql = getDb();
  let count = 0;

  for (const f of SEED_FORMULAS) {
    await sql`
      INSERT INTO canvas_formulas (slug, name, description, category, sql_template, param_names)
      VALUES (${f.slug}, ${f.name}, ${f.description}, ${f.category}, ${f.sql_template}, ${f.param_names})
      ON CONFLICT (slug) DO UPDATE SET
        name = ${f.name},
        description = ${f.description},
        category = ${f.category},
        sql_template = ${f.sql_template},
        param_names = ${f.param_names}
    `;
    count++;
  }

  return count;
}

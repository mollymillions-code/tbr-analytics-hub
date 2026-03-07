import { neon } from "@neondatabase/serverless";

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not configured");
  return neon(url);
}

// Call once on first deploy or manually to create the table
export async function initReportsTable() {
  const sql = getDb();
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
}

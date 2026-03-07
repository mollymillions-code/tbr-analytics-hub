import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// GET /api/reports — list all saved reports (metadata only)
export async function GET() {
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT id, name, query, saved_by, created_at
      FROM canvas_reports
      ORDER BY created_at DESC
      LIMIT 50
    `;

    const reports = rows.map((r) => ({
      id: r.id,
      name: r.name,
      query: r.query,
      savedBy: r.saved_by,
      savedAt: new Date(r.created_at).getTime(),
    }));

    return NextResponse.json(reports);
  } catch (error) {
    console.error("Failed to list reports:", error);
    return NextResponse.json([], { status: 200 });
  }
}

// POST /api/reports — save a new report
export async function POST(request: NextRequest) {
  try {
    const { name, query, result, savedBy } = await request.json();

    if (!name || !query || !result) {
      return NextResponse.json({ error: "Missing name, query, or result" }, { status: 400 });
    }

    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const sql = getDb();

    await sql`
      INSERT INTO canvas_reports (id, name, query, result, saved_by)
      VALUES (${id}, ${name}, ${query}, ${JSON.stringify(result)}, ${savedBy || "team"})
    `;

    return NextResponse.json({
      id,
      name,
      query,
      savedBy: savedBy || "team",
      savedAt: Date.now(),
    });
  } catch (error) {
    console.error("Failed to save report:", error);
    return NextResponse.json({ error: "Failed to save report" }, { status: 500 });
  }
}

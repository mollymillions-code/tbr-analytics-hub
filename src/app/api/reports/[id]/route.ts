import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// GET /api/reports/[id] — load a single report with full result data
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id || !/^[a-z0-9-]+$/.test(id)) {
      return NextResponse.json({ error: "Invalid report ID" }, { status: 400 });
    }

    const sql = getDb();
    const rows = await sql`
      SELECT id, name, query, result, saved_by, created_at
      FROM canvas_reports
      WHERE id = ${id}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const r = rows[0];
    return NextResponse.json({
      id: r.id,
      name: r.name,
      query: r.query,
      result: r.result,
      savedBy: r.saved_by,
      savedAt: new Date(r.created_at).getTime(),
    });
  } catch (error) {
    console.error("Failed to load report:", error);
    return NextResponse.json({ error: "Failed to load report" }, { status: 500 });
  }
}

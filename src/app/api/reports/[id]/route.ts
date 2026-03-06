import { NextRequest, NextResponse } from "next/server";
import { list } from "@vercel/blob";

const REPORTS_PREFIX = "canvas-reports/";

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

    const { blobs } = await list({ prefix: `${REPORTS_PREFIX}${id}.json` });

    if (blobs.length === 0) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const res = await fetch(blobs[0].url);
    const report = await res.json();

    return NextResponse.json(report);
  } catch (error) {
    console.error("Failed to load report:", error);
    return NextResponse.json({ error: "Failed to load report" }, { status: 500 });
  }
}

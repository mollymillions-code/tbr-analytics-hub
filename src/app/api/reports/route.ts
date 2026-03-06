import { NextRequest, NextResponse } from "next/server";
import { list, put } from "@vercel/blob";

const REPORTS_PREFIX = "canvas-reports/";

// GET /api/reports — list all saved reports (metadata only, no result payload)
export async function GET() {
  try {
    const { blobs } = await list({ prefix: REPORTS_PREFIX });

    const reports = blobs
      .map((blob) => {
        const id = blob.pathname.replace(REPORTS_PREFIX, "").replace(".json", "");
        return {
          id,
          url: blob.url,
          uploadedAt: blob.uploadedAt,
        };
      })
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

    // Fetch metadata for each report (name, query, savedBy, savedAt)
    const detailed = await Promise.all(
      reports.slice(0, 50).map(async (r) => {
        try {
          const res = await fetch(r.url);
          const data = await res.json();
          return {
            id: r.id,
            name: data.name as string,
            query: data.query as string,
            savedBy: (data.savedBy as string) || "unknown",
            savedAt: data.savedAt as number,
          };
        } catch {
          return null;
        }
      })
    );

    return NextResponse.json(detailed.filter(Boolean));
  } catch (error) {
    console.error("Failed to list reports:", error);
    return NextResponse.json([], { status: 200 });
  }
}

// POST /api/reports — save a new report
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, query, result, savedBy } = body;

    if (!name || !query || !result) {
      return NextResponse.json({ error: "Missing name, query, or result" }, { status: 400 });
    }

    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const report = {
      id,
      name,
      query,
      result,
      savedBy: savedBy || "unknown",
      savedAt: Date.now(),
    };

    await put(`${REPORTS_PREFIX}${id}.json`, JSON.stringify(report), {
      contentType: "application/json",
      access: "public",
    });

    return NextResponse.json({ id, name, query, savedBy: report.savedBy, savedAt: report.savedAt });
  } catch (error) {
    console.error("Failed to save report:", error);
    return NextResponse.json({ error: "Failed to save report" }, { status: 500 });
  }
}

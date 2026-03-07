import { NextRequest, NextResponse } from "next/server";
import { initAllTables } from "@/lib/db";
import { seedFormulas } from "@/lib/formulas";
import { seedDataFromJson } from "@/lib/etl";
import { getServerData } from "@/lib/server-data";

// GET /api/setup — create all tables (lightweight, safe to call repeatedly)
export async function GET() {
  try {
    await initAllTables();
    return NextResponse.json({ ok: true, message: "All tables created" });
  } catch (error) {
    console.error("Setup error:", error);
    return NextResponse.json(
      { ok: false, error: String(error) },
      { status: 500 }
    );
  }
}

// POST /api/setup — full seed: create tables + load race data + seed formulas
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const steps: string[] = [];

    // Step 1: Create tables
    await initAllTables();
    steps.push("Tables created");

    // Step 2: Seed formulas
    if (body.skipFormulas !== true) {
      const formulaCount = await seedFormulas();
      steps.push(`${formulaCount} formulas seeded`);
    }

    // Step 3: ETL — load JSON data into normalized tables
    if (body.skipData !== true) {
      const data = getServerData();
      const counts = await seedDataFromJson(data);
      steps.push(
        `Data loaded: ${counts.races} races, ${counts.sessions} sessions, ` +
        `${counts.results} results, ${counts.laps} laps, ${counts.championships} championship entries`
      );
    }

    return NextResponse.json({ ok: true, steps });
  } catch (error) {
    console.error("Setup/seed error:", error);
    return NextResponse.json(
      { ok: false, error: String(error) },
      { status: 500 }
    );
  }
}

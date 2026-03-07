import { NextResponse } from "next/server";
import { initReportsTable } from "@/lib/db";

// GET /api/setup — one-time DB init (create tables)
export async function GET() {
  try {
    await initReportsTable();
    return NextResponse.json({ ok: true, message: "Reports table created" });
  } catch (error) {
    console.error("Setup error:", error);
    return NextResponse.json(
      { ok: false, error: String(error) },
      { status: 500 }
    );
  }
}

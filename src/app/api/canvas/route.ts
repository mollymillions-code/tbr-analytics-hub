import { NextRequest, NextResponse } from "next/server";
import { computeForQuery, formatDataPacket } from "@/lib/compute";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-3.1-pro-preview";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// ─── System Prompt: LLM as Narrator, NOT Calculator ─────────────────────

const SYSTEM_PROMPT = `You are the Chief Performance Analyst for Team Blue Rising (TBR) in the UIM E1 World Electric Powerboat Championship. You have a PhD in Sports Analytics and 15 years in motorsport data engineering.

YOUR ROLE: You are a NARRATOR and CURATOR, not a calculator.

You receive PRE-COMPUTED, SQL-VERIFIED analytics data. Every number in the data packet has been computed deterministically from the official race database. Your job is to:

1. CURATE — decide which metrics are most relevant and interesting for the user's question
2. NARRATE — write compelling, insight-driven analysis that tells a story with the numbers
3. VISUALIZE — choose the best chart types and layouts to make the data impactful
4. CONNECT — find patterns across different metrics that reveal deeper insights

CRITICAL RULES:
- ONLY use numbers that appear in the VERIFIED COMPUTE RESULTS section below. Do NOT perform arithmetic, calculate averages, derive percentages, or estimate any values yourself.
- If a specific number is not in the data packet, say "data not available" rather than guessing.
- You may quote numbers exactly as they appear (e.g., "avg_position: 3.2" → "an average finish of P3.2").
- When comparing two numbers, state both values and let the reader see the difference (e.g., "Team A averages P3.2 while Team B averages P4.6") — do NOT compute the difference yourself.
- NEVER fabricate data. NEVER round or adjust numbers beyond what's in the data.
- NEVER say "approximately" or "roughly" — the numbers are exact.

ANALYSIS STYLE:
- Lead with the most surprising or impactful finding
- Use comparisons to create context ("X is Y% better than the grid average of Z")
- Find the narrative thread — what story do these numbers tell?
- Be specific: "Sector 2 deficit of 0.38s" not "slower in sector 2"
- Default to TBR-focused analysis when the query is ambiguous

VISUALIZATION REQUIREMENTS — aim for 3-6 visualizations per report:
- Bar charts: comparisons (teams, pilots, metrics side by side)
- Line charts: trends over time (position progression, lap time evolution, points trajectory)
- Pie charts: distribution/share (points share, fastest lap distribution)
- Tables: detailed breakdowns (per-race, per-session with multiple columns)
- Stat grids: 4-6 headline KPIs with context subtitles

STRUCTURE EVERY RESPONSE:
- Executive summary (2-3 sentences with headline numbers FROM THE DATA)
- Key metrics stat-grid (4-6 KPIs)
- Deep-dive analysis sections (2-4, each with heading + insight + visualization)
- Detailed breakdown table
- Strategic recommendations (backed by specific numbers from the data)

RESPONSE FORMAT — return ONLY valid JSON:
{
  "title": "Descriptive analytical title",
  "blocks": [
    { "type": "heading", "content": "Section heading" },
    { "type": "text", "content": "Analysis with **bold** for key numbers. Every number must come from the data packet." },
    { "type": "stat-grid", "stats": [
      { "label": "Metric", "value": "42", "color": "#0055D4", "sub": "Context subtitle" }
    ]},
    { "type": "chart", "chartType": "bar|line|pie", "chartData": [{"key": "val", "metric": 123}], "chartConfig": {
      "xKey": "key",
      "yKeys": [{ "key": "metric", "color": "#0055D4", "name": "Display Name" }],
      "height": 300
    }},
    { "type": "table", "tableData": {
      "headers": ["Col1", "Col2", "Col3", "Col4"],
      "rows": [["val1", "val2", "val3", "val4"]]
    }}
  ]
}

COLORS: #0055D4 (blue/primary), #00875A (green/positive), #D32F2F (red/negative), #6B3FA0 (purple), #E65100 (orange/warning), #B8860B (gold/highlight).

Tables should have 4+ columns. Stat-grid subtitles should provide context from the data.`;

// ─── API Handler ────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "Gemini API key not configured" },
      { status: 500 }
    );
  }

  try {
    const { query, dataSummary } = await request.json();

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Missing query" },
        { status: 400 }
      );
    }

    if (query.length > 500) {
      return NextResponse.json(
        { error: "Query too long (max 500 characters)" },
        { status: 400 }
      );
    }

    // ── Step 1: Compute verified metrics from SQL ──
    let computedData: string;
    let hasComputeResults = false;
    try {
      const packet = await computeForQuery(query);
      hasComputeResults = packet.results.length > 0;
      computedData = formatDataPacket(packet);
    } catch (computeErr) {
      console.error("Compute engine error, falling back to raw data:", computeErr);
      computedData = dataSummary || "";
    }

    // If compute returned nothing useful AND we have dataSummary, include it as supplementary
    const supplementary = !hasComputeResults && dataSummary
      ? `\n\n=== RAW DATA (supplementary — use for reference only) ===\n${dataSummary}`
      : "";

    // If we have absolutely no data, return a structured error
    if (!hasComputeResults && !dataSummary) {
      return NextResponse.json({
        title: "Insufficient Data",
        blocks: [
          { type: "text", content: "No data available for this query. Please ensure the database has been seeded via POST /api/setup." },
        ],
      });
    }

    const userPrompt = `${computedData}${supplementary}

---

USER QUERY: ${query}

INSTRUCTIONS: Using ONLY the verified compute results above, produce a comprehensive analytical report. Every number in your response must come directly from the data provided. Do not calculate, estimate, or derive any values — only reference numbers that appear in the compute results.

Include:
- An executive summary with headline numbers (quoted from the data)
- A stat-grid with 4-6 key performance indicators
- At least 2-3 different chart types comparing across multiple dimensions
- A detailed breakdown table with 4+ columns
- Strategic insights tied to specific numbers from the data

Respond with ONLY valid JSON matching the schema. No markdown fences.`;

    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY!,
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: SYSTEM_PROMPT }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: userPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          topP: 0.9,
          maxOutputTokens: 16384,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      return NextResponse.json(
        { error: `Gemini API error: ${response.status}` },
        { status: 502 }
      );
    }

    const geminiResponse = await response.json();
    const text =
      geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    if (!text) {
      console.error("Gemini returned empty response");
      return NextResponse.json(
        { error: "LLM returned empty response" },
        { status: 502 }
      );
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error("Gemini returned invalid JSON:", text.slice(0, 500));
      return NextResponse.json(
        { error: "LLM returned invalid response format" },
        { status: 502 }
      );
    }

    if (!parsed.title || !Array.isArray(parsed.blocks)) {
      return NextResponse.json(
        { error: "LLM response missing required fields" },
        { status: 502 }
      );
    }

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Canvas API error:", error);
    return NextResponse.json(
      { error: "Failed to generate analysis" },
      { status: 500 }
    );
  }
}

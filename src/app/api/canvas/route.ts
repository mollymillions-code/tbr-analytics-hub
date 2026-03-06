import { NextRequest, NextResponse } from "next/server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-3.1-pro-preview";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const SYSTEM_PROMPT = `You are the Chief Performance Analyst for Team Blue Rising (TBR) in the UIM E1 World Electric Powerboat Championship. You have a PhD in Sports Analytics and 15 years in motorsport data engineering. Your analysis is the kind that wins championships — every insight is backed by numbers, every recommendation is actionable, every comparison is multi-dimensional.

ANALYSIS DEPTH REQUIREMENTS — THIS IS CRITICAL:
Your analysis must ALWAYS be multi-layered and exhaustive. Never give surface-level summaries. For ANY query:

1. QUANTIFY EVERYTHING with precision:
   - Finish positions as distributions (median, mean, std dev, range)
   - Gaps in seconds with delta analysis (improving/declining trend per round)
   - Lap time consistency: coefficient of variation, best vs worst lap delta
   - Sector-level breakdowns: which sectors cost time, by how much, vs which competitors
   - Penalty/marker rates: SL/LL frequency per race, per lap, trend over time
   - Speed metrics: peak kph, average kph, speed differential to leader

2. ALWAYS COMPARE — never analyze in isolation:
   - Pilot vs pilot (head-to-head in same sessions, different metrics)
   - Team vs team (position delta, points trajectory, consistency)
   - Season vs season (progression, regression, where gaps closed/opened)
   - Session vs session (qualifying pace vs race pace, practice vs race correlation)

3. DERIVE STRATEGIC INSIGHTS:
   - "TBR's Sector 2 deficit of 0.38s vs Team Rafa accounts for 62% of their per-lap gap"
   - "Kimiläinen's 36 fastest laps mask a critical weakness: 78% came in non-race sessions"
   - "TBR's penalty rate of 1 LL per 8.2 laps is 2.3x the grid average"
   - Root cause hypotheses: throttle management, boat setup, driver error patterns

4. USE RICH VISUALIZATIONS — aim for 3-6 charts/tables per analysis:
   - Bar charts: comparisons (teams, pilots, metrics side by side)
   - Line charts: trends over time (position progression, lap time evolution, points trajectory)
   - Pie charts: distribution/share (points share, fastest lap distribution, penalty breakdown)
   - Tables: detailed breakdowns (per-race, per-session, per-pilot with multiple columns)
   - Stat grids: 4-6 headline KPIs with context in subtitles

5. STRUCTURE EVERY RESPONSE with clear sections:
   - Executive summary (2-3 sentence verdict with the headline numbers)
   - Key metrics stat-grid (4-6 KPIs)
   - Deep-dive analysis with charts (2-4 sections, each with heading + insight + visualization)
   - Detailed breakdown table (comprehensive data)
   - Strategic recommendations or key takeaways (data-backed)

RESPONSE FORMAT — return ONLY valid JSON:
{
  "title": "Descriptive analytical title",
  "blocks": [
    { "type": "heading", "content": "Section heading" },
    { "type": "text", "content": "Analysis with **bold** for key numbers. Every sentence must contain data." },
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

HARD RULES:
- NEVER fabricate data. Every number must come from the provided dataset.
- NEVER give shallow analysis. If asked "who is the best pilot" — analyze across 5+ dimensions (fastest laps, consistency, race wins, head-to-head records, sector performance, penalty rates) with supporting visualizations for EACH dimension.
- ALWAYS include at least 3 different visualization types (charts, tables, stat-grids).
- ALWAYS provide per-pilot or per-team dissection in a detailed table.
- For position data in line charts, note that lower position = better (P1 beats P5).
- Use multi-series charts (multiple yKeys) when comparing 2-3 entities on the same metric.
- Default to TBR-focused analysis when the query is ambiguous.
- Tables should have 4+ columns for proper analytical depth.
- Stat-grid subtitles should provide context: "vs grid avg 4.2", "up from P8 last season", "2nd in championship".`;

export async function POST(request: NextRequest) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "Gemini API key not configured" },
      { status: 500 }
    );
  }

  try {
    const { query, dataSummary } = await request.json();

    if (!query || !dataSummary) {
      return NextResponse.json(
        { error: "Missing query or dataSummary" },
        { status: 400 }
      );
    }

    const userPrompt = `Here is the COMPLETE E1 race data — every classification result, lap analysis, sector split, championship standing, and fastest lap record across all seasons:

${dataSummary}

---

USER QUERY: ${query}

INSTRUCTIONS: Produce a comprehensive, multi-section analytical report. Include:
- An executive summary with headline numbers
- A stat-grid with 4-6 key performance indicators (with contextual subtitles)
- At least 2-3 different chart types (bar, line, pie) comparing across multiple dimensions
- A detailed breakdown table with 4+ columns
- Strategic insights backed by specific numbers from the data above

Respond with ONLY valid JSON matching the schema. No markdown fences. Go deep — this analysis drives real team strategy decisions.`;

    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
          temperature: 0.4,
          topP: 0.95,
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

    // Parse the JSON response
    const parsed = JSON.parse(text);

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Canvas API error:", error);
    return NextResponse.json(
      { error: "Failed to generate analysis" },
      { status: 500 }
    );
  }
}

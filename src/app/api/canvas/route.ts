import { NextRequest, NextResponse } from "next/server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-3.1-pro-preview";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const SYSTEM_PROMPT = `You are the TBR Performance Analyst — the lead data engineer and race strategist for Team Blue Rising in the E1 World Championship (electric powerboat racing). You combine deep statistical expertise with motorsport domain knowledge.

PERSONA:
- You think in distributions, deltas, and trend lines — not vague qualitative statements.
- You quantify everything: finish positions, gap-to-leader in seconds, lap time standard deviations, sector splits, position changes per race, penalty frequency rates.
- You reference specific races, sessions, and pilots by name when the data supports it.
- You draw actionable strategic insights — e.g., "TBR loses 0.4s average in Sector 2 vs the leading pack, suggesting throttle management or line optimization needed."
- You compare across seasons and rounds, spotting trajectories (improving, declining, volatile).
- You are direct, concise, and professional — no filler. Every sentence should carry data or an insight.

RESPONSE FORMAT:
You must respond with ONLY a valid JSON object matching this exact schema — no markdown, no code fences, no explanation outside the JSON:

{
  "title": "Short descriptive title",
  "blocks": [
    { "type": "heading", "content": "Section heading text" },
    { "type": "text", "content": "Analysis text. Use **bold** for emphasis on key numbers and names." },
    { "type": "stat-grid", "stats": [
      { "label": "Metric Name", "value": "42", "color": "#0055D4", "sub": "Optional subtitle" }
    ]},
    { "type": "chart", "chartType": "bar|line|pie", "chartData": [{"xField": "val", "yField": 123}], "chartConfig": {
      "xKey": "xField",
      "yKeys": [{ "key": "yField", "color": "#0055D4", "name": "Display Name" }],
      "height": 300
    }},
    { "type": "table", "tableData": {
      "headers": ["Col1", "Col2"],
      "rows": [["val1", "val2"]]
    }}
  ]
}

RULES:
- Always include at least one stat-grid with key metrics when data is available.
- Include at least one chart when comparing teams, pilots, or trends over time. Use "bar" for comparisons, "line" for trends/progressions, "pie" for distribution/share.
- Include a table when showing detailed per-race or per-session breakdowns.
- Use these colors for stat values: blue #0055D4, green #00875A, red #D32F2F, purple #6B3FA0, orange #E65100, gold #B8860B.
- For charts, use these colors: #0055D4 (primary blue), #00875A (green), #D32F2F (red), #6B3FA0 (purple), #E65100 (orange), #B8860B (gold).
- All numbers must come from the provided data — never fabricate statistics.
- If the query is ambiguous, default to a Team Blue Rising focused analysis.
- If asked about something not in the data, say so clearly and suggest what IS available.
- Keep text blocks to 2-3 sentences max. Dense, data-rich.
- For line charts with position data, note that lower position numbers are better (P1 > P5).`;

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

    const userPrompt = `Here is the complete E1 race data context:

${dataSummary}

---

USER QUERY: ${query}

Respond with a JSON analysis object following the schema in your instructions. Remember: only valid JSON, no markdown fences.`;

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
          temperature: 0.3,
          topP: 0.9,
          maxOutputTokens: 8192,
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

import { getDb } from "@/lib/db";

// ─── Context Extraction ───────────────────────────────────────────────────
// Fast regex-based extraction from query text. No LLM needed.

interface QueryContext {
  teams: string[];       // team name fragments to filter on
  season: string | null; // specific season or null for all
  categories: string[];  // which formula categories are relevant
}

const TEAM_KEYWORDS: Record<string, string> = {
  "tbr": "blue rising",
  "blue rising": "blue rising",
  "team blue rising": "blue rising",
  "brady": "brady",
  "miami": "miami",
  "rafa": "rafa",
  "perez": "perez",
  "westbrook": "westbrook",
  "drogba": "drogba",
  "aoki": "aoki",
  "alula": "alula",
  "lebron": "lebron",
  "monaco": "monaco",
  "sierra": "sierra",
  "stark": "sierra",
  "sharky": "sharky",
  "didier": "drogba",
  "tom brady": "brady",
};

function extractContext(query: string): QueryContext {
  const q = query.toLowerCase();

  // Extract teams
  const teams: string[] = [];
  for (const [keyword, teamName] of Object.entries(TEAM_KEYWORDS)) {
    if (q.includes(keyword) && !teams.includes(teamName)) {
      teams.push(teamName);
    }
  }

  // Extract season
  let season: string | null = null;
  const seasonMatch = q.match(/season\s*(\d)/i);
  if (seasonMatch) {
    const num = seasonMatch[1];
    const yearMap: Record<string, string> = { "1": "Season 1 - 2024", "2": "Season 2 - 2025", "3": "Season 3 - 2026" };
    season = yearMap[num] || null;
  }
  if (!season && q.includes("2024")) season = "Season 1 - 2024";
  if (!season && q.includes("2025")) season = "Season 2 - 2025";
  if (!season && q.includes("2026")) season = "Season 3 - 2026";

  // Determine relevant categories from query keywords
  const categories: string[] = [];

  if (q.match(/penalty|penalt|mistake|error|long lap|short lap|\bsl\b|\bll\b|marker/)) {
    categories.push("penalties");
  }
  if (q.match(/sector|s1|s2|s3|split/)) {
    categories.push("sectors");
  }
  if (q.match(/championship|standing|points|title/)) {
    categories.push("championship");
  }
  if (q.match(/fastest|speed|kph|lap time|pace|quick|slow/)) {
    categories.push("speed");
  }
  if (q.match(/compar|vs|versus|against|head.to.head|match/)) {
    categories.push("comparison");
  }
  if (q.match(/overview|summary|all teams|grid|who|every/)) {
    categories.push("overview");
  }
  if (q.match(/qualify|grid|start|gain|lost place/)) {
    categories.push("performance");
  }
  if (q.match(/dnf|retire|finish|dns|dsq/)) {
    categories.push("performance");
  }
  if (q.match(/trend|progress|improv|regress|over time|season/)) {
    categories.push("performance", "speed");
  }

  // Always include performance as baseline
  if (!categories.includes("performance")) {
    categories.push("performance");
  }

  return { teams, season, categories };
}

// ─── Formula Execution ────────────────────────────────────────────────────

export interface ComputeResult {
  formula_slug: string;
  formula_name: string;
  category: string;
  rows: Record<string, unknown>[];
}

export interface DataPacket {
  context: QueryContext;
  results: ComputeResult[];
  computed_at: string;
}

export async function computeForQuery(query: string): Promise<DataPacket> {
  const sql = getDb();
  const context = extractContext(query);

  // Load formulas matching the relevant categories
  const formulas = await sql`
    SELECT slug, name, category, sql_template, param_names
    FROM canvas_formulas
    WHERE category = ANY(${context.categories})
    ORDER BY usage_count DESC
  `;

  const results: ComputeResult[] = [];

  for (const formula of formulas) {
    try {
      const paramNames = formula.param_names as string[];

      // Skip formulas that require params we don't have
      if (paramNames.includes("team_filter_2") && context.teams.length < 2) continue;

      const params = buildParams(paramNames, context);
      const rows = await sql.query(formula.sql_template as string, params);

      if (rows.length > 0) {
        results.push({
          formula_slug: formula.slug as string,
          formula_name: formula.name as string,
          category: formula.category as string,
          rows: rows as Record<string, unknown>[],
        });

        // Increment usage count (fire-and-forget)
        sql`UPDATE canvas_formulas SET usage_count = usage_count + 1 WHERE slug = ${formula.slug}`.catch(() => {});
      }
    } catch (err) {
      console.error(`Formula ${formula.slug} failed:`, err);
      // Skip failed formulas, don't break the whole compute
    }
  }

  return {
    context,
    results,
    computed_at: new Date().toISOString(),
  };
}

function buildParams(paramNames: string[], context: QueryContext): (string | null)[] {
  return paramNames.map((name) => {
    if (name === "team_filter") return context.teams[0] || null;
    if (name === "team_filter_2") return context.teams[1] || null;
    if (name === "season_filter") return context.season;
    return null;
  });
}

// ─── Data Packet Formatter ────────────────────────────────────────────────
// Converts compute results into a concise text summary for the LLM.

export function formatDataPacket(packet: DataPacket): string {
  const lines: string[] = [];

  lines.push("=== VERIFIED COMPUTE RESULTS ===");
  lines.push(`Query context: teams=${packet.context.teams.join(",")||"all"} | season=${packet.context.season||"all"} | categories=${packet.context.categories.join(",")}`);
  lines.push(`Computed at: ${packet.computed_at}`);
  lines.push("");

  for (const result of packet.results) {
    lines.push(`--- ${result.formula_name} [${result.category}] (${result.rows.length} rows) ---`);

    if (result.rows.length === 0) continue;

    // Header from first row's keys
    const keys = Object.keys(result.rows[0]);
    lines.push(keys.join(" | "));

    // Cap at 50 rows to keep context manageable
    const displayRows = result.rows.slice(0, 50);
    for (const row of displayRows) {
      const vals = keys.map((k) => {
        const v = row[k];
        if (v === null || v === undefined) return "-";
        if (Array.isArray(v)) return v.join(", ");
        return String(v);
      });
      lines.push(vals.join(" | "));
    }

    if (result.rows.length > 50) {
      lines.push(`... and ${result.rows.length - 50} more rows`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

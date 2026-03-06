// Global canvas analysis store — persists across page navigation
// This is a module-level singleton, not tied to React lifecycle

export interface AnalysisBlock {
  type: "text" | "chart" | "table" | "stat-grid" | "heading";
  content?: string;
  chartType?: "bar" | "line" | "pie";
  chartData?: Record<string, unknown>[];
  chartConfig?: {
    xKey: string;
    yKeys: { key: string; color: string; name: string }[];
    height?: number;
  };
  tableData?: { headers: string[]; rows: string[][] };
  stats?: { label: string; value: string; color: string; sub?: string }[];
}

export interface CanvasResult {
  title: string;
  blocks: AnalysisBlock[];
}

type Listener = () => void;

interface CanvasState {
  query: string;
  result: CanvasResult | null;
  isAnalyzing: boolean;
  history: string[];
  error: string | null;
  startTime: number | null;
}

const listeners = new Set<Listener>();

let state: CanvasState = {
  query: "",
  result: null,
  isAnalyzing: false,
  history: [],
  error: null,
  startTime: null,
};

// Pending request tracking
let currentAbortController: AbortController | null = null;

function notify() {
  for (const fn of listeners) fn();
}

export function getCanvasState(): CanvasState {
  return state;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setQuery(q: string) {
  state = { ...state, query: q };
  notify();
}

export function clearResult() {
  state = { ...state, result: null, query: "", error: null };
  notify();
}

export async function runAnalysis(
  query: string,
  dataSummary: string,
  fallbackFn?: (q: string) => CanvasResult
) {
  if (!query.trim() || !dataSummary) return;

  // Cancel previous request
  if (currentAbortController) {
    currentAbortController.abort();
  }

  const controller = new AbortController();
  currentAbortController = controller;

  state = {
    ...state,
    query,
    isAnalyzing: true,
    result: null,
    error: null,
    startTime: Date.now(),
    history: [query, ...state.history.filter((h) => h !== query)].slice(0, 10),
  };
  notify();

  try {
    const response = await fetch("/api/canvas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, dataSummary }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const parsed: CanvasResult = await response.json();

    if (!controller.signal.aborted) {
      state = { ...state, result: parsed, isAnalyzing: false, error: null, startTime: null };
      notify();
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return;
    console.error("Canvas analysis error:", err);

    // Fallback to local analysis
    if (fallbackFn && !controller.signal.aborted) {
      const fallback = fallbackFn(query);
      state = { ...state, result: fallback, isAnalyzing: false, error: null, startTime: null };
      notify();
    } else if (!controller.signal.aborted) {
      state = { ...state, isAnalyzing: false, error: "Analysis failed. Please try again.", startTime: null };
      notify();
    }
  } finally {
    if (currentAbortController === controller) {
      currentAbortController = null;
    }
  }
}

"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getCanvasState, subscribe } from "@/lib/canvas-store";

export function CanvasStatus() {
  const pathname = usePathname();
  const state = useSyncExternalStore(subscribe, getCanvasState, getCanvasState);
  const [elapsed, setElapsed] = useState(0);

  // Update elapsed time every second while analyzing
  useEffect(() => {
    if (!state.isAnalyzing || !state.startTime) {
      setElapsed(0);
      return;
    }

    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - state.startTime!) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [state.isAnalyzing, state.startTime]);

  // Don't show on the canvas page itself (it has its own UI)
  if (pathname === "/canvas") return null;

  // Don't show if not analyzing and no recent result
  if (!state.isAnalyzing) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      <Link
        href="/canvas"
        className="flex items-center gap-3 bg-white border border-[#D0D5DD] rounded-xl px-4 py-3 shadow-lg hover:shadow-xl transition-shadow"
      >
        <div className="w-5 h-5 border-3 border-[var(--accent-cyan)] border-t-transparent rounded-full animate-spin flex-shrink-0" />
        <div className="min-w-0">
          <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
            Analyzing: {state.query}
          </div>
          <div className="text-[10px] text-[var(--text-muted)]">
            {elapsed}s elapsed — click to view
          </div>
        </div>
        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#E8ECF1] rounded-b-xl overflow-hidden">
          <div
            className="h-full bg-[var(--accent-cyan)] transition-all duration-1000 ease-linear"
            style={{ width: `${Math.min(elapsed * 5, 95)}%` }}
          />
        </div>
      </Link>
    </div>
  );
}

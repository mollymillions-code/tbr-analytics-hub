"use client";

import { useSession, signOut } from "next-auth/react";

export function UserMenu() {
  const { data: session } = useSession();

  if (!session?.user) return null;

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[var(--text-muted)] hidden md:block">{session.user.email}</span>
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--accent-red)] uppercase tracking-wider transition-colors cursor-pointer"
      >
        Sign Out
      </button>
    </div>
  );
}

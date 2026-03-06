"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;

    const domain = trimmed.split("@")[1];
    if (!domain || !["teambluerising.com", "leaguesportsco.com"].includes(domain)) {
      setErrorMsg("Only @teambluerising.com and @leaguesportsco.com emails are authorized.");
      return;
    }

    setLoading(true);
    const result = await signIn("credentials", {
      email: trimmed,
      callbackUrl: "/",
      redirect: false,
    });

    if (result?.error) {
      setErrorMsg("Access denied. Please check your email address.");
      setLoading(false);
    } else if (result?.url) {
      window.location.href = result.url;
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-10 max-w-md w-full text-center">
        <img src="/tbr-logo.svg" alt="TBR" className="w-20 h-20 mx-auto mb-6" />
        <h1 className="font-display text-2xl font-bold tracking-wider mb-2">TBR ANALYTICS HUB</h1>
        <p className="text-[var(--text-secondary)] text-sm mb-8">
          Team Blue Rising &middot; E1 World Championship
        </p>

        {error === "CredentialsSignin" && !errorMsg && (
          <div className="bg-[rgba(255,0,64,0.1)] border border-[rgba(255,0,64,0.3)] rounded-lg px-4 py-3 mb-6">
            <p className="text-[var(--accent-red)] text-sm font-semibold">Access Denied</p>
            <p className="text-[var(--text-muted)] text-xs mt-1">
              Only @teambluerising.com and @leaguesportsco.com email addresses are authorized.
            </p>
          </div>
        )}

        {errorMsg && (
          <div className="bg-[rgba(255,0,64,0.1)] border border-[rgba(255,0,64,0.3)] rounded-lg px-4 py-3 mb-6">
            <p className="text-[var(--accent-red)] text-sm font-semibold">Access Denied</p>
            <p className="text-[var(--text-muted)] text-xs mt-1">{errorMsg}</p>
          </div>
        )}

        {error && error !== "CredentialsSignin" && !errorMsg && (
          <div className="bg-[rgba(255,136,0,0.1)] border border-[rgba(255,136,0,0.3)] rounded-lg px-4 py-3 mb-6">
            <p className="text-[var(--accent-orange)] text-sm font-semibold">Sign-in Error</p>
            <p className="text-[var(--text-muted)] text-xs mt-1">
              Something went wrong. Please try again.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your.name@teambluerising.com"
            required
            className="w-full px-4 py-3 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-cyan)] transition-colors"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-3 bg-[var(--accent-cyan)] text-white font-semibold text-sm rounded-lg hover:bg-[#003DA5] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="text-[var(--text-secondary)] text-[10px] font-semibold uppercase tracking-widest mt-6">
          Restricted to authorized team members
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[var(--accent-cyan)] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}

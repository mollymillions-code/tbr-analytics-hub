import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TBR Analytics Hub — Team Blue Rising",
  description: "Race analytics and performance data for Team Blue Rising — E1 World Championship",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <header className="sticky top-0 z-50 border-b-2 border-[var(--accent-cyan)] bg-[#0d0d0d]/95 backdrop-blur-md">
          <div className="max-w-[1600px] mx-auto flex items-center justify-between px-5 py-3">
            <a href="/" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#0047FF] flex items-center justify-center">
                <span className="font-display text-white text-sm font-bold">E1</span>
              </div>
              <div>
                <div className="font-display text-sm font-bold tracking-wider text-white">TBR ANALYTICS HUB</div>
                <div className="text-[10px] text-[var(--text-muted)] tracking-widest uppercase">Team Blue Rising</div>
              </div>
            </a>
            <nav className="flex items-center gap-6">
              <a href="/" className="text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--accent-cyan)] uppercase tracking-wider transition-colors">
                Seasons
              </a>
              <a href="/canvas" className="text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--accent-cyan)] uppercase tracking-wider transition-colors">
                Canvas
              </a>
            </nav>
          </div>
        </header>
        <main className="max-w-[1600px] mx-auto px-5 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}

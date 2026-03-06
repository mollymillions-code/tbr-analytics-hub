import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import localFont from "next/font/local";
import { Inter, JetBrains_Mono, Montserrat, Poppins } from "next/font/google";
import "./globals.css";
import { auth } from "@/auth";
import { Providers } from "@/components/Providers";
import { UserMenu } from "@/components/UserMenu";

const integral = localFont({
  src: [
    {
      path: "../../public/fonts/IntegralCF-Bold.otf",
      weight: "700",
      style: "normal",
    },
    {
      path: "../../public/fonts/IntegralCF-DemiBold.otf",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../public/fonts/IntegralCF-BoldOblique.otf",
      weight: "700",
      style: "italic",
    },
  ],
  variable: "--font-integral",
  display: "swap",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-montserrat",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TBR Analytics Hub — Team Blue Rising",
  description: "Race analytics and performance data for Team Blue Rising — E1 World Championship",
  icons: {
    icon: "/tbr-logo.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <html
      lang="en"
      className={`${integral.variable} ${poppins.variable} ${montserrat.variable} ${inter.variable} ${jetBrainsMono.variable}`}
    >
      <body className="antialiased">
        <Providers session={session}>
          <header className="sticky top-0 z-50 border-b-2 border-[var(--accent-cyan)] bg-[var(--bg-header)] backdrop-blur-md">
            <div className="max-w-[1600px] mx-auto flex items-center justify-between px-5 py-3">
              <Link href="/" prefetch={false} className="flex items-center gap-3">
                <Image src="/tbr-logo.svg" alt="TBR" width={40} height={40} className="w-10 h-10" priority />
                <div>
                  <div className="font-display text-sm font-bold tracking-wider text-white">TBR ANALYTICS HUB</div>
                  <div className="text-[10px] text-[var(--text-muted)] tracking-widest uppercase">Team Blue Rising</div>
                </div>
              </Link>
              <nav className="flex items-center gap-6">
                <Link href="/" prefetch={false} className="text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--accent-cyan)] uppercase tracking-wider transition-colors">
                  Seasons
                </Link>
                <Link href="/canvas" prefetch={false} className="text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--accent-cyan)] uppercase tracking-wider transition-colors">
                  Canvas
                </Link>
                <UserMenu />
              </nav>
            </div>
          </header>
          <main className="max-w-[1600px] mx-auto px-5 py-6">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}

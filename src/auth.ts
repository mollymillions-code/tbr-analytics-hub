import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { NextResponse } from "next/server";

const ALLOWED_DOMAINS = ["teambluerising.com", "leaguesportsco.com"];

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
      },
      async authorize(credentials) {
        const email = (credentials?.email as string)?.trim().toLowerCase();
        if (!email) return null;

        const domain = email.split("@")[1];
        if (!domain || !ALLOWED_DOMAINS.includes(domain)) return null;

        return { id: email, email, name: email.split("@")[0] };
      },
    }),
  ],
  callbacks: {
    authorized({ request, auth }) {
      const { pathname } = request.nextUrl;

      if (pathname.startsWith("/login")) {
        return true;
      }

      if (pathname.startsWith("/api/")) {
        return auth
          ? true
          : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      return !!auth;
    },
    async session({ session }) {
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
});

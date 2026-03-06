import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { NextResponse } from "next/server";

const ALLOWED_DOMAINS = ["teambluerising.com", "leaguesportsco.com"];

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
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
    async signIn({ user }) {
      const email = user.email;
      if (!email) return false;
      const domain = email.split("@")[1]?.toLowerCase();
      return ALLOWED_DOMAINS.includes(domain);
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

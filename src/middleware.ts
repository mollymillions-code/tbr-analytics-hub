export { auth as middleware } from "@/auth";

export const config = {
  matcher: [
    // Protect all routes except login, api/auth, static files, and data
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico|data/).*)",
  ],
};

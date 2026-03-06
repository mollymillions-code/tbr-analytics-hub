import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getServerData } from "@/lib/server-data";

export async function GET() {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(getServerData(), {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}

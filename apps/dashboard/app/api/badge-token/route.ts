import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { checkRateLimit } from "../../../lib/rate-limit";

// Server-side proxy that mints a short-TTL signed certification badge token
// (O4, SR-11). The embed URL is built from the server-only AI_SERVICE_URL --
// that base URL itself isn't secret, only the service-role/Claude keys
// behind it are -- so it's safe to return to the operator's browser.

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { allowed } = checkRateLimit(userData.user.id, "badge-token:create", {
      limit: 10,
      windowMs: 60_000,
    });
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    const zoneId = body?.zoneId;
    if (typeof zoneId !== "string" || zoneId.length === 0) {
      return NextResponse.json({ error: "zoneId is required" }, { status: 400 });
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const upstream = await fetch(`${process.env.AI_SERVICE_URL}/zones/${zoneId}/badge-token`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (!upstream.ok) {
      console.error(`POST /api/badge-token upstream failed: ${upstream.status}`);
      return NextResponse.json({ error: "Failed to generate badge" }, { status: 502 });
    }

    const { token, expires_in } = await upstream.json();
    return NextResponse.json(
      { embedUrl: `${process.env.AI_SERVICE_URL}/badge/${token}`, expiresIn: expires_in },
      { status: 200 }
    );
  } catch (error) {
    console.error("POST /api/badge-token failed:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

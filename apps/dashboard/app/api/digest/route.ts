import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { checkRateLimit } from "../../../lib/rate-limit";

// Server-side proxy to the FastAPI AI service. The dashboard user is
// re-authenticated here (untrusted frontend), rate-limited, then the request
// is forwarded with the user's Supabase access token as a Bearer credential --
// the AI service verifies that JWT itself and enforces ownership server-side.
// AI_SERVICE_URL is a server-only var (never NEXT_PUBLIC_); upstream error
// bodies are never relayed verbatim.

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { allowed } = checkRateLimit(userData.user.id, "digest:generate", {
      limit: 5,
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

    const upstream = await fetch(
      `${process.env.AI_SERVICE_URL}/zones/${zoneId}/digest`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "content-type": "application/json",
        },
        body: "{}",
      }
    );

    if (!upstream.ok) {
      // Don't relay upstream status/body verbatim -- generic failure to the client.
      console.error(`POST /api/digest upstream failed: ${upstream.status}`);
      return NextResponse.json({ error: "Failed to generate digest" }, { status: 502 });
    }

    const digest = await upstream.json();
    return NextResponse.json(digest, { status: 200 });
  } catch (error) {
    console.error("POST /api/digest failed:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

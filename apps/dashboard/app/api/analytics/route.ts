import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { checkRateLimit } from "../../../lib/rate-limit";

// Server-side proxy to the FastAPI ai-service analytics endpoint (O3). Same
// shape as /api/digest: re-authenticate the dashboard user (untrusted
// frontend), rate-limit, then forward their own access token as the Bearer
// credential so the ai-service verifies it and enforces zone ownership itself.

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { allowed } = checkRateLimit(userData.user.id, "analytics:read", {
      limit: 30,
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

    const upstream = await fetch(`${process.env.AI_SERVICE_URL}/zones/${zoneId}/analytics`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (!upstream.ok) {
      console.error(`POST /api/analytics upstream failed: ${upstream.status}`);
      return NextResponse.json({ error: "Failed to load analytics" }, { status: 502 });
    }

    const analytics = await upstream.json();
    return NextResponse.json(analytics, { status: 200 });
  } catch (error) {
    console.error("POST /api/analytics failed:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

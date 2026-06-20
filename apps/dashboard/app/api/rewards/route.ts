import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { checkRateLimit } from "../../../lib/rate-limit";
import { rewardCreateSchema } from "../../../lib/validation/reward";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { allowed } = checkRateLimit(userData.user.id, "rewards:write", { limit: 20, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = rewardCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("rewards")
    .insert({
      zone_id: parsed.data.zoneId,
      name: parsed.data.name,
      points_cost: parsed.data.pointsCost,
    })
    .select()
    .single();

  if (error) {
    // Don't leak raw Postgres/PostgREST error text (constraint/column names) to the client.
    console.error("POST /api/rewards insert failed:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

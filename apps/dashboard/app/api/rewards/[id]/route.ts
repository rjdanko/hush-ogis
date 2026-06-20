import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { checkRateLimit } from "../../../../lib/rate-limit";
import { rewardUpdateSchema } from "../../../../lib/validation/reward";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;
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
  const parsed = rewardUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.pointsCost !== undefined) update.points_cost = parsed.data.pointsCost;

  const { data, error } = await supabase.from("rewards").update(update).eq("id", id).select().maybeSingle();

  if (error) {
    // Don't leak raw Postgres/PostgREST error text (constraint/column names) to the client.
    console.error("PATCH /api/rewards/[id] update failed:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  // RLS's USING clause filters rows it denies rather than erroring -- a
  // nonexistent id and an id belonging to a zone another operator owns both
  // land here as "zero rows updated", which is a 404 from the caller's point
  // of view, not a 500.
  if (!data) {
    return NextResponse.json({ error: "Reward not found" }, { status: 404 });
  }

  return NextResponse.json(data, { status: 200 });
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { allowed } = checkRateLimit(userData.user.id, "rewards:write", { limit: 20, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { data, error } = await supabase.from("rewards").delete().eq("id", id).select().maybeSingle();
  if (error) {
    // Don't leak raw Postgres/PostgREST error text (constraint/column names) to the client.
    console.error("DELETE /api/rewards/[id] delete failed:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  // Same RLS-filters-rather-than-errors reasoning as PATCH above: a no-op
  // delete (wrong owner or nonexistent id) is a 404, not a false-positive 204.
  if (!data) {
    return NextResponse.json({ error: "Reward not found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}

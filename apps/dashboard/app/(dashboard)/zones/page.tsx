import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { fetchLatestQuietIndexBatch } from "../../../lib/quiet-index";
import { LiveZoneFeed } from "../../../components/LiveZoneFeed";

export default async function ZonesPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  // The (dashboard) layout already redirects unauthenticated requests before
  // this page renders; this is a defensive re-check, not the primary gate.
  if (!userData.user) {
    redirect("/login");
  }

  const { data: zoneRows } = await supabase
    .from("zones")
    .select("id, name, created_at")
    .eq("operator_id", userData.user.id)
    .order("created_at", { ascending: false });

  const zones = zoneRows ?? [];
  const zoneIds = zones.map((z) => z.id as string);
  const readingsMap = await fetchLatestQuietIndexBatch(supabase, zoneIds);

  const feedZones = zones.map((z) => ({
    id: z.id as string,
    name: z.name as string,
    createdAt: z.created_at as string,
    reading: readingsMap.get(z.id as string) ?? { value: null, activeCount: null },
  }));

  return (
    <div className="flex flex-col gap-10">
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-display font-light text-ink text-[2rem] leading-tight tracking-tight">
            Live zone feed
          </h1>
          <p className="font-sans text-sm text-warm-muted">
            {zones.length === 0
              ? "No zones yet"
              : zones.length === 1
                ? "1 zone · updates in real time"
                : `${zones.length} zones · updates in real time`}
          </p>
        </div>
        <Link
          href="/zones/new"
          className={outlineButtonClass}
        >
          New zone
        </Link>
      </div>

      <LiveZoneFeed zones={feedZones} />
    </div>
  );
}

const outlineButtonClass = [
  "rounded-full border border-warm-border px-4 py-2",
  "font-sans text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-charcoal",
  "hover:border-accent hover:text-accent transition-colors duration-150",
].join(" ");

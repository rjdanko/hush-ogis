"use client";

import { useEffect, useState } from "react";
import { createClient } from "../lib/supabase/client";
import { formatQuietIndex } from "../lib/quiet-index";

export function LiveQuietIndex({ zoneId, initialValue }: { zoneId: string; initialValue: number | null }) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    // Realtime authorizes postgres_changes filters against the connection's
    // own JWT (via has_column_privilege), not the apikey query param -- without
    // this, the socket authenticates as `anon`, which has no grant on
    // quiet_index at all, and every filtered subscribe is rejected server-side
    // with "invalid column for filter" instead of ever firing onUpdate.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) supabase.realtime.setAuth(data.session.access_token);

      channel = supabase
        .channel(`quiet-index:${zoneId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "quiet_index", filter: `zone_id=eq.${zoneId}` },
          (payload: { new: { value: number } }) => setValue(Number(payload.new.value))
        )
        .subscribe();
    });

    return () => {
      channel?.unsubscribe();
    };
  }, [zoneId]);

  return (
    <section className="flex flex-col gap-1 rounded border border-neutral-200 p-4">
      <h2 className="text-sm uppercase tracking-wide text-neutral-500">Live Quiet Index</h2>
      <p className="text-3xl font-light">{formatQuietIndex(value)}</p>
    </section>
  );
}

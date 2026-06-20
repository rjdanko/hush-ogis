import Link from "next/link";
import { createClient } from "../../../lib/supabase/server";

export default async function ZonesPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const { data: zones } = await supabase
    .from("zones")
    .select("id, name, created_at")
    .eq("operator_id", userData.user!.id)
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-light tracking-wide">Your zones</h1>
        <Link href="/zones/new" className="rounded bg-black px-3 py-2 text-white">
          New zone
        </Link>
      </div>
      <ul className="flex flex-col gap-2">
        {(zones ?? []).map((zone) => (
          <li key={zone.id}>
            <Link href={`/zones/${zone.id}`} className="underline">
              {zone.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

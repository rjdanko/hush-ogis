import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen">
      <nav className="flex items-center justify-between border-b px-6 py-4">
        <Link href="/zones" className="font-light tracking-wide">
          Hush — Operator Console
        </Link>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  );
}

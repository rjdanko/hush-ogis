import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect("/login");
  }

  async function signOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-paper">
      <nav className="flex items-center justify-between border-b border-warm-border bg-surface px-8 py-4">
        <div className="flex items-center gap-3">
          <Link
            href="/zones"
            className="font-display font-light text-ink text-xl tracking-tight hover:text-accent transition-colors duration-150"
          >
            Hush
          </Link>
          <span className="font-sans text-[0.5rem] font-semibold uppercase tracking-[0.2em] text-warm-muted select-none">
            Operator Console
          </span>
        </div>
        <form action={signOut} className="flex items-center gap-3">
          <span className="hidden sm:block font-sans text-xs text-warm-muted truncate max-w-[180px]">
            {data.user.email}
          </span>
          <button
            type="submit"
            className="rounded-full border border-warm-border px-3 py-1.5 font-sans text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-charcoal hover:border-accent hover:text-accent transition-colors duration-150"
          >
            Sign out
          </button>
        </form>
      </nav>
      <main className="mx-auto max-w-3xl px-8 py-10">{children}</main>
    </div>
  );
}

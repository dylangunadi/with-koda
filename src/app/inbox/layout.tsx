"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function InboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Grain overlay */}
      <div className="grain fixed inset-0 pointer-events-none" />

      <nav className="sticky top-0 z-50 border-b border-border/40 bg-background/90 backdrop-blur-md relative">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-6">
          <Link
            href="/inbox"
            className="flex items-center gap-2"
          >
            <div className="status-dot" />
            <span className="font-heading text-xl font-bold tracking-tight text-foreground">
              Koda
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/settings"
              className="font-system text-muted-foreground hover:text-foreground transition-colors"
            >
              Settings
            </Link>
            <button
              onClick={handleSignOut}
              className="font-system text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>
      <main className="relative z-10 mx-auto max-w-4xl px-6 py-8">{children}</main>
    </div>
  );
}

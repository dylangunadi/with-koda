import Link from "next/link";
import { redirect } from "next/navigation";
import { KodaLogo } from "@/components/KodaLogo";
import { WaitlistForm } from "@/components/WaitlistForm";

// Simple holding page while the full site is in progress (full landing
// lives at /full). The video is served from the public KODA-V1-DEMO Supabase
// Storage bucket; NEXT_PUBLIC_LANDING_VIDEO_URL overrides it.
const DEFAULT_VIDEO_URL =
  "https://fbjcohgaaeaojdgtyxbm.supabase.co/storage/v1/object/public/KODA-V1-DEMO/" +
  encodeURIComponent("Adobe Express - Koda_Extension_Demo_Final.mp4");
const VIDEO_URL = process.env.NEXT_PUBLIC_LANDING_VIDEO_URL || DEFAULT_VIDEO_URL;
const POSTER_URL = process.env.NEXT_PUBLIC_LANDING_VIDEO_POSTER || undefined;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  // Auth emails configured with a bare site URL land here with ?code=...;
  // hand the code to the real callback so the click still signs the user in.
  const { code } = await searchParams;
  if (code) {
    redirect(`/auth/callback?code=${encodeURIComponent(code)}`);
  }
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2.5">
          <KodaLogo size={26} />
          <span className="font-heading text-lg font-semibold tracking-tight text-foreground">
            Koda
          </span>
        </Link>
        <Link
          href="/login"
          className="text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Log in
        </Link>
      </header>

      <main className="mx-auto max-w-4xl px-6 pb-20 pt-6 sm:pt-10">
        <h1 className="text-center text-4xl sm:text-5xl font-heading font-semibold leading-[1.08] tracking-tight text-foreground">
          Your recruiting agent.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-center text-base sm:text-lg text-muted-foreground">
          Three moves, every morning.
        </p>

        <div className="mt-10 overflow-hidden rounded-xl border border-border bg-black shadow-sm">
          <video
            data-testid="landing-video"
            className="aspect-video w-full"
            src={VIDEO_URL}
            poster={POSTER_URL}
            controls
            playsInline
            preload="metadata"
          />
        </div>

        <section id="waitlist" className="mx-auto mt-12 max-w-md">
          <h2 className="text-center text-2xl font-heading font-semibold text-foreground">
            Join the waitlist
          </h2>
          <p className="mt-2 mb-6 text-center text-sm text-muted-foreground">
            We&apos;ll reach out when your brief is ready.
          </p>
          <WaitlistForm simple />
        </section>
      </main>
    </div>
  );
}

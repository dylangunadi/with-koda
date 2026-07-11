import Link from "next/link";
import { Target, MessageSquare, Lightbulb } from "lucide-react";
import { WaitlistForm } from "@/components/WaitlistForm";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="text-xl font-heading font-bold text-primary">Koda</span>
          <Link
            href="/login"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Log in
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-6 pt-24 pb-20 text-center">
        <h1 className="text-4xl sm:text-5xl font-heading font-bold leading-tight text-foreground">
          Stop applying blindly.
          <br />
          <span className="text-primary">Start recruiting strategically.</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
          Koda is your AI recruiting agent. It turns your goals into daily
          recruiting moves — the right opportunity, the right person, and the
          right thing to send.
        </p>
        <a
          href="#waitlist"
          className="mt-8 inline-flex items-center rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Join the waitlist
        </a>
      </section>

      {/* Value Pillars */}
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <div className="grid gap-6 sm:grid-cols-3">
          <PillarCard
            icon={<Target className="h-6 w-6 text-primary" />}
            title="Personalized recruiting moves"
            description="Koda generates 3 daily actions tailored to your profile, target roles, and companies — not generic job listings."
          />
          <PillarCard
            icon={<MessageSquare className="h-6 w-6 text-primary" />}
            title="Ready-to-send outreach"
            description="Get warm, specific outreach drafts that reference your actual work and sound like you, not a template."
          />
          <PillarCard
            icon={<Lightbulb className="h-6 w-6 text-primary" />}
            title="Proof-of-work ideas"
            description="Stand out with small, completable projects that demonstrate real signal to the people you want to reach."
          />
        </div>
      </section>

      {/* How It Works */}
      <section className="border-t border-border bg-secondary/30 py-24">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-2xl font-heading font-bold text-foreground">
            How it works
          </h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            <Step number="1" title="Set your goals" description="Add your target roles, companies, and background." />
            <Step number="2" title="Get 3 moves" description="Koda generates recruiting actions specific to you." />
            <Step number="3" title="Take action" description="Edit drafts, send outreach, and track what works." />
          </div>
        </div>
      </section>

      {/* Waitlist */}
      <section id="waitlist" className="py-24 bg-background">
        <div className="mx-auto max-w-xl px-6 text-center">
          <h2 className="text-2xl font-heading font-bold text-foreground">
            Get early access
          </h2>
          <p className="mt-3 text-muted-foreground">
            We are opening Koda to a small group of students first.
          </p>
          <div className="mt-8">
            <WaitlistForm />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="mx-auto max-w-5xl px-6 text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} Koda. Built for students who recruit differently.
        </div>
      </footer>
    </div>
  );
}

function PillarCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-4">{icon}</div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
        {description}
      </p>
    </div>
  );
}

function Step({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
        {number}
      </div>
      <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

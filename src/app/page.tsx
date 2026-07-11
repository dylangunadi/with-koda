import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { WaitlistForm } from "@/components/WaitlistForm";

export default function Home() {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Grain overlay */}
      <div className="grain fixed inset-0 pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="status-dot" />
            <span className="text-xl font-heading font-bold tracking-tight text-foreground">
              Koda
            </span>
          </div>
          <Link
            href="/login"
            className="group flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Log in
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pt-20 pb-16 sm:pt-28 sm:pb-24">
        <div className="grid gap-16 lg:grid-cols-[1fr,auto] lg:items-center">
          {/* Left: Copy */}
          <div className="max-w-xl">
            <p className="font-system text-primary mb-4 page-enter" style={{ animationDelay: "0ms" }}>
              Opportunity agent for student builders
            </p>
            <h1
              className="text-4xl sm:text-5xl lg:text-[3.4rem] font-heading font-bold leading-[1.1] tracking-tight text-foreground page-enter"
              style={{ animationDelay: "60ms" }}
            >
              The right opportunity.
              <br />
              The right person.
              <br />
              <span className="text-primary">The right thing to send.</span>
            </h1>
            <p
              className="mt-6 text-lg leading-relaxed text-muted-foreground max-w-md page-enter"
              style={{ animationDelay: "120ms" }}
            >
              Koda watches the landscape, learns what you care about, and
              surfaces 3 moves you can execute today — people to reach,
              things to build, drafts to send.
            </p>
            <div
              className="mt-8 flex flex-wrap items-center gap-4 page-enter"
              style={{ animationDelay: "180ms" }}
            >
              <a
                href="#waitlist"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Get early access
                <ArrowRight className="size-4" />
              </a>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                I have an account
              </Link>
            </div>
          </div>

          {/* Right: Mock Briefing Card */}
          <div
            className="relative w-full max-w-sm page-enter"
            style={{ animationDelay: "300ms" }}
          >
            <MockBriefingCard />
          </div>
        </div>
      </section>

      {/* Social proof line */}
      <section className="relative z-10 border-y border-border/40 bg-secondary/30">
        <div className="mx-auto max-w-6xl px-6 py-5">
          <p className="font-system text-muted-foreground text-center">
            Built by students at Berkeley · For students recruiting into tech, startups, PM, and AI
          </p>
        </div>
      </section>

      {/* What Koda does — show, don't tell */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <div className="max-w-2xl mb-14">
          <p className="font-system text-primary mb-3">How it works</p>
          <h2 className="text-3xl sm:text-4xl font-heading font-bold leading-tight text-foreground">
            Koda runs while you focus on building.
          </h2>
        </div>

        <div className="grid gap-6 sm:grid-cols-3">
          <StepCard
            number="01"
            title="Teach Koda about you"
            description="Your target roles, companies, and what you've built. Koda learns your recruiting DNA in 2 minutes."
            delay="0ms"
          />
          <StepCard
            number="02"
            title="Get your daily brief"
            description="3 moves, every day. A person to contact, a thing to build, a draft to send. Each one explains why it matters for you."
            delay="60ms"
          />
          <StepCard
            number="03"
            title="Koda learns from you"
            description="Accept, reject, edit. Every action teaches Koda your taste. Your next brief is sharper than the last."
            delay="120ms"
          />
        </div>
      </section>

      {/* Move types showcase */}
      <section className="relative z-10 border-t border-border/40 bg-secondary/20 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-2xl mb-14">
            <p className="font-system text-primary mb-3">Five move types</p>
            <h2 className="text-3xl sm:text-4xl font-heading font-bold leading-tight text-foreground">
              Not job listings. Recruiting intelligence.
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <MoveTypeCard type="Person to Contact" example="A PM at a Series B fintech who went to your school" color="bg-blue-500/10 text-blue-700 dark:text-blue-400" />
            <MoveTypeCard type="Proof of Work" example="Write a 1-page teardown of their latest feature launch" color="bg-purple-500/10 text-purple-700 dark:text-purple-400" />
            <MoveTypeCard type="Outreach Draft" example="A warm, specific message referencing your shared background" color="bg-amber-500/10 text-amber-700 dark:text-amber-400" />
            <MoveTypeCard type="Opportunity" example="An unlisted role at a company aligned with your thesis" color="bg-teal-500/10 text-teal-700 dark:text-teal-400" />
            <MoveTypeCard type="Follow Up" example="Re-engage that conversation from 2 weeks ago with new context" color="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" />
          </div>
        </div>
      </section>

      {/* Waitlist */}
      <section id="waitlist" className="relative z-10 py-20 sm:py-28 bg-background">
        <div className="mx-auto max-w-lg px-6">
          <div className="text-center mb-10">
            <p className="font-system text-primary mb-3">Early access</p>
            <h2 className="text-3xl font-heading font-bold text-foreground">
              Join the first cohort
            </h2>
            <p className="mt-3 text-muted-foreground">
              We&apos;re opening Koda to a small group of students who recruit
              with intention. No spam, no fluff — just your agent, ready to work.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-sm">
            <WaitlistForm />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/40 py-8">
        <div className="mx-auto max-w-6xl px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="status-dot" />
            <span className="font-heading font-semibold text-sm text-foreground">Koda</span>
          </div>
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} · Built for students who recruit differently
          </p>
        </div>
      </footer>
    </div>
  );
}

function MockBriefingCard() {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-lg overflow-hidden">
      {/* Card header */}
      <div className="border-b border-border/60 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="status-dot" />
          <span className="font-system text-muted-foreground">Koda brief · today</span>
        </div>
        <span className="font-system text-primary">3 moves</span>
      </div>

      {/* Mock moves */}
      <div className="divide-y divide-border/40">
        <MockMove
          type="Person"
          typeColor="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
          title="Connect with a PM at Notion"
          reason="They shipped a feature similar to your side project last month."
        />
        <MockMove
          type="Proof of Work"
          typeColor="bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300"
          title="Write a product teardown of Linear"
          reason="Your target companies use Linear — this shows you think like them."
        />
        <MockMove
          type="Outreach"
          typeColor="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
          title="Draft a message to that startup founder"
          reason="You both went to Berkeley and they're hiring for your exact role."
        />
      </div>

      {/* Footer */}
      <div className="px-5 py-3 bg-secondary/30 border-t border-border/40">
        <p className="font-system text-muted-foreground text-center">
          ↑ This is what your inbox looks like
        </p>
      </div>
    </div>
  );
}

function MockMove({
  type,
  typeColor,
  title,
  reason,
}: {
  type: string;
  typeColor: string;
  title: string;
  reason: string;
}) {
  return (
    <div className="px-5 py-4 space-y-2">
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${typeColor}`}>
          {type}
        </span>
      </div>
      <p className="text-sm font-medium text-foreground leading-snug">{title}</p>
      <p className="text-xs italic text-primary/70">{reason}</p>
    </div>
  );
}

function StepCard({
  number,
  title,
  description,
  delay,
}: {
  number: string;
  title: string;
  description: string;
  delay: string;
}) {
  return (
    <div
      className="group rounded-xl border border-border bg-card p-6 hover:border-primary/30 transition-colors page-enter"
      style={{ animationDelay: delay }}
    >
      <span className="font-system text-primary/50 group-hover:text-primary transition-colors">
        {number}
      </span>
      <h3 className="mt-3 text-lg font-heading font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

function MoveTypeCard({
  type,
  example,
  color,
}: {
  type: string;
  example: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${color}`}>
        {type}
      </span>
      <p className="text-sm text-muted-foreground leading-relaxed">
        &ldquo;{example}&rdquo;
      </p>
    </div>
  );
}

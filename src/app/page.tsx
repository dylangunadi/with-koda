import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { WaitlistForm } from "@/components/WaitlistForm";
import { AgentStatus } from "@/components/AgentStatus";

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
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </div>
      </header>

      {/* Hero — true 2-column with large product mock */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pt-16 pb-10 sm:pt-20 sm:pb-14 lg:pt-24 lg:pb-16">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.15fr] lg:gap-14 items-center">
          {/* Left: copy */}
          <div className="page-enter" style={{ animationDelay: "0ms" }}>
            <p className="font-system text-primary mb-4">
              Opportunity agent for student builders
            </p>
            <h1
              className="text-4xl sm:text-5xl lg:text-[3.2rem] font-heading font-bold leading-[1.08] tracking-tight text-foreground page-enter"
              style={{ animationDelay: "60ms" }}
            >
              The right opportunity.
              <br />
              The right person.
              <br />
              <span className="text-primary">The right thing to send.</span>
            </h1>
            <p
              className="mt-5 text-[15.5px] leading-[1.65] text-foreground/70 max-w-md page-enter"
              style={{ animationDelay: "120ms" }}
            >
              Koda watches the landscape, learns what you care about, and
              surfaces 3 moves you can execute today — people to reach,
              things to build, drafts to send.
            </p>
            <div
              className="mt-7 flex flex-wrap items-center gap-4 page-enter"
              style={{ animationDelay: "180ms" }}
            >
              <a
                href="#waitlist"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Get early access
                <ArrowRight className="size-4" aria-hidden="true" />
              </a>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                I have an account
              </Link>
            </div>
          </div>

          {/* Right: large product mock */}
          <div
            className="page-enter"
            style={{ animationDelay: "240ms" }}
          >
            <HeroProductMock />
          </div>
        </div>
      </section>

      {/* Social proof line */}
      <section className="relative z-10 border-y border-border/40 bg-secondary/30">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <p className="font-system text-foreground/50 text-center">
            Built by students at Berkeley &middot; For students recruiting into tech, startups, PM, and AI
          </p>
        </div>
      </section>

      {/* How it works — compact */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <div className="max-w-xl mb-10">
          <p className="font-system text-primary mb-3">How it works</p>
          <h2 className="text-3xl sm:text-[2.1rem] font-heading font-bold leading-tight text-foreground">
            Koda runs while you focus on building.
          </h2>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
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

      {/* Product showcase — expanded move detail */}
      <section className="relative z-10 border-t border-border/40 bg-secondary/20 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center mb-10">
            <p className="font-system text-primary mb-3">Inside a move</p>
            <h2 className="text-3xl sm:text-[2.1rem] font-heading font-bold leading-tight text-foreground">
              Everything you need to act — nothing you don&apos;t.
            </h2>
          </div>

          <ExpandedMoveMock />
        </div>
      </section>

      {/* Move types — 3x2 grid */}
      <section className="relative z-10 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-xl mb-10">
            <p className="font-system text-primary mb-3">Six move types</p>
            <h2 className="text-3xl sm:text-[2.1rem] font-heading font-bold leading-tight text-foreground">
              Not job listings. Recruiting intelligence.
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MoveTypeCard type="Person to Contact" example="A PM at a Series B fintech who went to your school" color="bg-blue-500/10 text-blue-700" />
            <MoveTypeCard type="Proof of Work" example="Write a 1-page teardown of their latest feature launch" color="bg-purple-500/10 text-purple-700" />
            <MoveTypeCard type="Outreach Draft" example="A warm, specific message referencing your shared background" color="bg-amber-500/10 text-amber-700" />
            <MoveTypeCard type="Opportunity" example="An unlisted role at a company aligned with your thesis" color="bg-teal-500/10 text-teal-700" />
            <MoveTypeCard type="Follow Up" example="Re-engage that conversation from 2 weeks ago with new context" color="bg-emerald-500/10 text-emerald-700" />
            <MoveTypeCard type="Daily Brief" example="A morning digest summarizing the 3 highest-signal moves for today" color="bg-rose-500/10 text-rose-700" />
          </div>
        </div>
      </section>

      {/* Mission section — deep green */}
      <section className="relative z-10 mission-section py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <p className="font-system text-teal-300/80 mb-4">Why we built Koda</p>
          <h2 className="text-3xl sm:text-4xl font-heading font-bold leading-[1.15] text-white">
            Your network should not depend on what you were born into.
          </h2>
          <p className="mt-5 text-[15.5px] leading-[1.65] text-teal-100/70 max-w-xl mx-auto">
            We believe the best opportunities should find you based on what you build,
            not who you know. Koda levels the playing field — one move at a time.
          </p>
        </div>
      </section>

      {/* Waitlist */}
      <section id="waitlist" className="relative z-10 py-16 sm:py-20 bg-background">
        <div className="mx-auto max-w-lg px-6">
          <div className="text-center mb-8">
            <p className="font-system text-primary mb-3">Early access</p>
            <h2 className="text-3xl font-heading font-bold text-foreground">
              Join the first cohort
            </h2>
            <p className="mt-3 text-[15px] text-foreground/70 leading-relaxed">
              We&apos;re onboarding a small group of students who recruit
              with intention. Your agent ships the day you sign up.
            </p>
            <p className="mt-2 font-system text-foreground/40">
              Currently onboarding students from Berkeley, Stanford, and MIT
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-sm">
            <WaitlistForm />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/40 py-6">
        <div className="mx-auto max-w-6xl px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="status-dot" />
            <span className="font-heading font-semibold text-sm text-foreground">Koda</span>
          </div>
          <p className="text-xs text-foreground/40">
            &copy; {new Date().getFullYear()} &middot; Built for students who recruit differently
          </p>
        </div>
      </footer>
    </div>
  );
}

/* ─── Hero Product Mock ─── */

function HeroProductMock() {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-xl overflow-hidden move-card">
      {/* Window chrome */}
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border/60 bg-secondary/40">
        <div className="size-2 rounded-full bg-border" />
        <div className="size-2 rounded-full bg-border" />
        <div className="size-2 rounded-full bg-border" />
        <span className="ml-3 font-system text-foreground/30">koda &middot; agent inbox</span>
      </div>

      {/* Agent status bar — animated */}
      <AgentStatus />

      {/* Brief header */}
      <div className="px-5 py-3 border-b border-border/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="status-dot" />
          <span className="font-system text-foreground/50">Today&apos;s brief</span>
        </div>
        <span className="font-system text-primary">3 moves</span>
      </div>

      {/* Mock moves — staggered appearance */}
      <div className="divide-y divide-border/40">
        <div className="mock-move-enter" style={{ animationDelay: "2900ms" }}>
          <MockMove
            type="Person"
            typeColor="bg-blue-100 text-blue-800"
            title="Connect with a PM at Notion"
            reason="They shipped a feature similar to your side project last month."
          />
        </div>
        <div className="mock-move-enter" style={{ animationDelay: "3100ms" }}>
          <MockMove
            type="Proof of Work"
            typeColor="bg-purple-100 text-purple-800"
            title="Write a product teardown of Linear"
            reason="Your target companies use Linear — this shows you think like them."
          />
        </div>
        <div className="mock-move-enter" style={{ animationDelay: "3300ms" }}>
          <MockMove
            type="Outreach"
            typeColor="bg-amber-100 text-amber-800"
            title="Draft a message to that startup founder"
            reason="You both went to Berkeley and they're hiring for your exact role."
          />
        </div>
      </div>

      {/* Footer action bar */}
      <div className="px-5 py-2.5 bg-secondary/30 border-t border-border/40 flex items-center gap-3">
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
          <svg aria-hidden="true" className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          Accept
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-400">
          <svg aria-hidden="true" className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          Pass
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          <svg aria-hidden="true" className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
          Save
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-blue-500">
          <svg aria-hidden="true" className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
          Send
        </span>
      </div>
    </div>
  );
}

/* ─── Expanded Move Mock ─── */

function ExpandedMoveMock() {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-lg overflow-hidden max-w-2xl mx-auto">
      {/* Move header */}
      <div className="px-6 py-5 border-b border-border/40">
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-blue-100 text-blue-800">
            Person
          </span>
          <span className="font-system text-foreground/40">High confidence</span>
        </div>
        <h3 className="text-lg font-heading font-semibold text-foreground leading-snug">
          Connect with Sarah Chen, PM at Notion
        </h3>
        <p className="mt-1.5 text-sm text-primary/70 italic">
          She shipped their recent API platform — your database project shows similar product instincts.
        </p>
      </div>

      {/* Expanded sections */}
      <div className="divide-y divide-border/40">
        {/* Outreach draft */}
        <div className="px-6 py-4">
          <p className="font-system text-primary mb-2">Suggested outreach</p>
          <div className="rounded-lg bg-secondary/40 border border-border/40 px-4 py-3 text-sm text-foreground/80 leading-relaxed">
            &ldquo;Hi Sarah — I saw Notion&apos;s API platform launch last month and thought
            the developer experience decisions were really sharp. I&apos;m a junior at
            Berkeley building something similar for student tools. Would love to hear
            how your team approached the auth layer. Happy to share what I&apos;ve learned
            building mine.&rdquo;
          </div>
        </div>

        {/* Proof of work */}
        <div className="px-6 py-4">
          <p className="font-system text-primary mb-2">Proof of work idea</p>
          <p className="text-sm text-foreground/70 leading-relaxed">
            Write a short teardown of Notion&apos;s API documentation comparing it to
            Linear&apos;s and Figma&apos;s. Share it on Twitter and tag her.
          </p>
        </div>

        {/* Follow-up timing */}
        <div className="px-6 py-4">
          <p className="font-system text-primary mb-2">Follow-up timing</p>
          <p className="text-sm text-foreground/70 leading-relaxed">
            If no response in 5 days, send a brief follow-up referencing any new
            Notion updates. Keep it under 3 sentences.
          </p>
        </div>
      </div>

      {/* Action bar */}
      <div className="px-6 py-3 bg-secondary/30 border-t border-border/40 flex items-center gap-4">
        <button className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors" type="button">
          <svg aria-hidden="true" className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          Accept &amp; add to inbox
        </button>
        <button className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground/40 hover:text-foreground/60 transition-colors" type="button">
          Edit draft
        </button>
        <button className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-blue-500 hover:text-blue-600 transition-colors" type="button">
          <svg aria-hidden="true" className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
          Send now
        </button>
      </div>
    </div>
  );
}

/* ─── Shared sub-components ─── */

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
    <div className="px-5 py-3.5 space-y-1.5">
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
      className="group rounded-xl border border-border bg-card p-5 hover:border-primary/30 transition-colors page-enter"
      style={{ animationDelay: delay }}
    >
      <span className="font-system text-primary/50 group-hover:text-primary transition-colors">
        {number}
      </span>
      <h3 className="mt-2.5 text-lg font-heading font-semibold text-foreground">{title}</h3>
      <p className="mt-1.5 text-sm text-foreground/60 leading-relaxed">{description}</p>
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
    <div className="rounded-xl border border-border bg-card p-5 space-y-2.5">
      <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${color}`}>
        {type}
      </span>
      <p className="text-sm text-foreground/60 leading-relaxed">
        &ldquo;{example}&rdquo;
      </p>
    </div>
  );
}

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
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="status-dot" />
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
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pt-16 pb-10 sm:pt-20 sm:pb-14 lg:pt-24 lg:pb-16">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.15fr] lg:gap-16 items-center">
          {/* Left: copy */}
          <div className="page-enter" style={{ animationDelay: "0ms" }}>
            <p className="font-system text-primary mb-4">
              Your recruiting agent
            </p>
            <h1
              className="text-4xl sm:text-5xl lg:text-[3.2rem] font-heading font-semibold leading-[1.08] tracking-tight text-foreground page-enter"
              style={{ animationDelay: "60ms" }}
            >
              The right opportunity.
              <br />
              The right person.
              <br />
              <span className="text-primary">The right thing to send.</span>
            </h1>
            <p
              className="mt-5 text-[15px] leading-[1.7] text-muted-foreground max-w-[26rem] page-enter"
              style={{ animationDelay: "120ms" }}
            >
              Tell Koda what you are aiming for. It prepares three concrete
              moves: who to contact, what to send, and what to do next.
            </p>
            <div
              className="mt-7 flex flex-wrap items-center gap-3 page-enter"
              style={{ animationDelay: "180ms" }}
            >
              <a
                href="#waitlist"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-[#075B59] transition-colors"
              >
                Get early access
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </a>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
              >
                I have an account
              </Link>
            </div>
          </div>

          {/* Right: Koda Brief mock */}
          <div
            className="page-enter"
            style={{ animationDelay: "240ms" }}
          >
            <HeroBriefMock />
          </div>
        </div>
      </section>

      {/* Trust row */}
      <section className="relative z-10 border-y border-border/50">
        <div className="mx-auto max-w-6xl px-6 py-3.5">
          <p className="font-system text-muted-foreground text-center">
            Built for students recruiting into tech, startups, product, and AI. You approve every send.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <div className="max-w-xl mb-10">
          <p className="font-system text-primary mb-3">How it works</p>
          <h2 className="text-3xl sm:text-[2rem] font-heading font-semibold leading-tight text-foreground">
            Koda runs while you focus on building.
          </h2>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <StepCard
            number="01"
            title="Tell Koda what you want"
            description="Add your target roles, companies, experience, and constraints."
            delay="0ms"
          />
          <StepCard
            number="02"
            title="Wake up to your brief"
            description="Koda prepares three moves worth acting on, with drafts and context already attached."
            delay="60ms"
          />
          <StepCard
            number="03"
            title="Teach Koda your taste"
            description="Accept, edit, save, or pass. Each choice improves the next brief."
            delay="120ms"
          />
        </div>
      </section>

      {/* Path divider */}
      <div className="relative z-10 mx-auto max-w-6xl px-6">
        <div className="path-divider">
          <div className="signal-node" />
        </div>
      </div>

      {/* Inside your Koda Brief */}
      <section className="relative z-10 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center mb-10">
            <p className="font-system text-primary mb-3">Inside your Koda Brief</p>
            <h2 className="text-3xl sm:text-[2rem] font-heading font-semibold leading-tight text-foreground">
              Every move comes with the context you need to act.
            </h2>
          </div>

          <ExpandedBriefMock />
        </div>
      </section>

      {/* Path divider */}
      <div className="relative z-10 mx-auto max-w-6xl px-6">
        <div className="path-divider">
          <div className="signal-node" />
        </div>
      </div>

      {/* Move types */}
      <section className="relative z-10 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-xl mb-10">
            <p className="font-system text-primary mb-3">Six move types</p>
            <h2 className="text-3xl sm:text-[2rem] font-heading font-semibold leading-tight text-foreground">
              Not another list of jobs. Three moves you can make.
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MoveTypeCard type="Person to contact" example="A PM at a Series B fintech who shares your school and shipped a product you admire." color="bg-blue-500/8 text-blue-700" />
            <MoveTypeCard type="Work worth sending" example="A one-page teardown of their latest feature that shows you think like their team." color="bg-violet-500/8 text-violet-700" />
            <MoveTypeCard type="Message ready" example="A specific, warm message referencing shared context. Ready to review and send." color="bg-amber-500/8 text-amber-700" />
            <MoveTypeCard type="Opportunity to explore" example="A role at a company aligned with what you are building. Not a generic listing." color="bg-teal-500/8 text-teal-700" />
            <MoveTypeCard type="Follow-up due" example="That conversation from two weeks ago. New context to re-engage before it cools." color="bg-emerald-500/8 text-emerald-700" />
            <MoveTypeCard type="Daily brief" example="Three moves, every morning. Prepared while you were away." color="bg-rose-500/8 text-rose-700" />
          </div>
        </div>
      </section>

      {/* Mission section */}
      <section className="relative z-10 mission-section py-16 sm:py-24">
        <div className="relative mx-auto max-w-4xl px-6">
          <div className="text-center mb-12">
            <p className="font-system text-teal-300/70 mb-4">Why we built Koda</p>
            <h2 className="text-3xl sm:text-4xl font-heading font-semibold leading-[1.15] text-white">
              Opportunity should not depend on who you already know.
            </h2>
            <p className="mt-5 text-[15px] leading-[1.7] text-teal-100/80 max-w-xl mx-auto">
              Some students inherit a recruiting playbook. Others have to build
              one themselves. Koda helps them find the path in, show what they
              can do, and keep momentum alive.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            <MissionPillar
              label="Access"
              headline="Find the path in."
              description="Koda finds the people and openings that match what you are building."
            />
            <MissionPillar
              label="Signal"
              headline="Show what you can do."
              description="Proof of work ideas and outreach drafts that demonstrate your thinking."
            />
            <MissionPillar
              label="Momentum"
              headline="Keep the opportunity alive."
              description="Follow-up timing and re-engagement before warm paths go cold."
            />
          </div>
        </div>
      </section>

      {/* Waitlist */}
      <section id="waitlist" className="relative z-10 py-16 sm:py-20 bg-background">
        <div className="mx-auto max-w-lg px-6">
          <div className="text-center mb-8">
            <p className="font-system text-primary mb-3">Early access</p>
            <h2 className="text-3xl font-heading font-semibold text-foreground">
              Join the first cohort
            </h2>
            <p className="mt-3 text-[15px] text-muted-foreground leading-relaxed">
              We are opening Koda to a small group of students first. Join to
              receive your first personalized brief and help shape how Koda works.
            </p>
            <p className="mt-2 font-system text-muted-foreground/60">
              Built from 20+ student interviews
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
            <WaitlistForm />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/50 py-6">
        <div className="mx-auto max-w-6xl px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="status-dot" />
            <span className="font-heading font-semibold text-sm text-foreground">Koda</span>
          </div>
          <p className="font-system text-muted-foreground/50">
            For students building their way in
          </p>
        </div>
      </footer>
    </div>
  );
}

/* ─── Hero Brief Mock ─── */

function HeroBriefMock() {
  return (
    <div className="relative">
      {/* Main brief card */}
      <div className="rounded-2xl border border-border bg-card shadow-xl overflow-hidden move-card">
        {/* Window chrome */}
        <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border/60 bg-secondary/50">
          <div className="size-[7px] rounded-full bg-border" />
          <div className="size-[7px] rounded-full bg-border" />
          <div className="size-[7px] rounded-full bg-border" />
          <span className="ml-3 font-system text-muted-foreground/50">koda</span>
        </div>

        {/* Agent status bar */}
        <AgentStatus />

        {/* Brief header */}
        <div className="px-5 py-3 border-b border-border/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="status-dot" />
            <span className="font-system text-muted-foreground">Koda Brief &middot; Today</span>
          </div>
          <span className="font-system text-primary">3 moves ready</span>
        </div>

        {/* Featured move — expanded */}
        <div className="px-5 py-4 border-b border-border/40">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-blue-500/8 text-blue-700">
              Person
            </span>
            <span className="font-system text-primary/60">High confidence</span>
          </div>
          <p className="text-sm font-medium text-foreground leading-snug">
            Connect with Sarah Chen, PM at Notion
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground leading-relaxed">
            She shipped their API platform last month. Your database project shows similar product thinking.
          </p>

          {/* Brief details */}
          <div className="mt-3 space-y-2">
            <div className="flex items-start gap-2">
              <span className="font-system text-primary/50 w-24 shrink-0 pt-0.5">Message</span>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                Draft ready. References her API launch and your shared background.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-system text-primary/50 w-24 shrink-0 pt-0.5">Proof</span>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                Write a short API docs comparison. Share it and tag her.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-system text-primary/50 w-24 shrink-0 pt-0.5">Follow-up</span>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                5 days. Reference any new Notion updates.
              </p>
            </div>
          </div>
        </div>

        {/* Other moves — compact */}
        <div className="divide-y divide-border/40">
          <div className="mock-move-enter" style={{ animationDelay: "3000ms" }}>
            <MockMoveCompact
              type="Work"
              typeColor="bg-violet-500/8 text-violet-700"
              title="Write a product teardown of Linear"
            />
          </div>
          <div className="mock-move-enter" style={{ animationDelay: "3200ms" }}>
            <MockMoveCompact
              type="Message"
              typeColor="bg-amber-500/8 text-amber-700"
              title="Draft for that startup founder you met last week"
            />
          </div>
        </div>

        {/* Action bar */}
        <div className="px-5 py-2.5 bg-secondary/40 border-t border-border/40 flex items-center gap-3">
          <span role="img" aria-label="Accept move" className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
            <svg aria-hidden="true" className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            Accept
          </span>
          <span role="img" aria-label="Pass on move" className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground/60">
            <svg aria-hidden="true" className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            Pass
          </span>
          <span role="img" aria-label="Save move" className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground/60">
            <svg aria-hidden="true" className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
            Save
          </span>
          <span role="img" aria-label="Send move" className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-primary">
            <svg aria-hidden="true" className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
            Send
          </span>
        </div>
      </div>

      {/* Floating mini-cards */}
      <div
        className="absolute -right-3 top-12 rounded-lg border border-border bg-card px-3 py-2 shadow-md hidden lg:flex items-center gap-2 page-enter"
        style={{ animationDelay: "3400ms" }}
      >
        <div className="size-1.5 rounded-full bg-amber-500" />
        <span className="font-system text-muted-foreground">1 follow-up due</span>
      </div>
      <div
        className="absolute -left-3 bottom-16 rounded-lg border border-border bg-card px-3 py-2 shadow-md hidden lg:flex items-center gap-2 page-enter"
        style={{ animationDelay: "3600ms" }}
      >
        <div className="size-1.5 rounded-full bg-primary" />
        <span className="font-system text-muted-foreground">2 warm paths found</span>
      </div>
    </div>
  );
}

/* ─── Expanded Brief Mock ─── */

function ExpandedBriefMock() {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden max-w-2xl mx-auto">
      {/* Move header */}
      <div className="px-6 py-5 border-b border-border/40">
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-blue-500/8 text-blue-700">
            Person
          </span>
          <span className="font-system text-primary/50">High confidence</span>
        </div>
        <h3 className="text-lg font-heading font-semibold text-foreground leading-snug">
          Connect with Sarah Chen, PM at Notion
        </h3>
      </div>

      {/* Structured sections */}
      <div className="divide-y divide-border/40">
        <BriefSection label="Why now">
          She shipped their API platform last month. Your database project shows similar product thinking. Reaching out now is timely.
        </BriefSection>

        <BriefSection label="Message ready">
          <div className="rounded-lg bg-secondary/60 border border-border/40 px-4 py-3 text-sm text-foreground/80 leading-relaxed">
            Hi Sarah. I saw Notion&apos;s API platform launch last month and thought the DX
            decisions were sharp. I&apos;m building something similar for student tools at
            Berkeley. Would love to hear how your team approached the auth layer. Happy
            to share what I have learned building mine.
          </div>
        </BriefSection>

        <BriefSection label="Proof of work">
          Write a short teardown of Notion&apos;s API docs, comparing them to Linear&apos;s and
          Figma&apos;s. Share it publicly and tag her.
        </BriefSection>

        <BriefSection label="Follow-up plan">
          If no response in 5 days, send a brief follow-up referencing any new Notion
          updates. Keep it under 3 sentences.
        </BriefSection>
      </div>

      {/* Action bar */}
      <div className="px-6 py-3 bg-secondary/40 border-t border-border/40 flex items-center gap-4">
        <button className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors" type="button">
          <svg aria-hidden="true" className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          Accept
        </button>
        <button className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors" type="button">
          Edit draft
        </button>
        <button className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground/60 hover:text-muted-foreground transition-colors" type="button">
          Pass
        </button>
        <button className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-[#075B59] transition-colors" type="button">
          <svg aria-hidden="true" className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
          Send now
        </button>
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function BriefSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-6 py-4">
      <p className="font-system text-primary/60 mb-2">{label}</p>
      {typeof children === "string" ? (
        <p className="text-sm text-muted-foreground leading-relaxed">{children}</p>
      ) : (
        children
      )}
    </div>
  );
}

function MockMoveCompact({
  type,
  typeColor,
  title,
}: {
  type: string;
  typeColor: string;
  title: string;
}) {
  return (
    <div className="px-5 py-3 flex items-center gap-3">
      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider shrink-0 ${typeColor}`}>
        {type}
      </span>
      <p className="text-sm text-foreground leading-snug truncate">{title}</p>
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
      <span className="font-system text-primary/40 group-hover:text-primary transition-colors">
        {number}
      </span>
      <h3 className="mt-2.5 text-[17px] font-semibold text-foreground">{title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{description}</p>
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
      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${color}`}>
        {type}
      </span>
      <p className="text-sm text-muted-foreground leading-relaxed">
        {example}
      </p>
    </div>
  );
}

function MissionPillar({
  label,
  headline,
  description,
}: {
  label: string;
  headline: string;
  description: string;
}) {
  return (
    <div className="relative text-center sm:text-left">
      <p className="font-system text-teal-300/50 mb-2">{label}</p>
      <h3 className="text-lg font-heading font-semibold text-white leading-snug">
        {headline}
      </h3>
      <p className="mt-2 text-sm text-teal-100/70 leading-relaxed">
        {description}
      </p>
    </div>
  );
}

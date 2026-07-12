"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { saveProfile } from "./actions"

const STEPS = [
  {
    title: "About You",
    label: "step 01",
    slug: "about you",
    description: "The basics so Koda knows who you are.",
  },
  {
    title: "What You Want",
    label: "step 02",
    slug: "your targets",
    description: "Tell Koda what kind of opportunities to look for.",
  },
  {
    title: "Your Experience",
    label: "step 03",
    slug: "your background",
    description: "Help Koda write better outreach for you. All optional.",
  },
  {
    title: "Focus",
    label: "step 04",
    slug: "your focus",
    description: "What should Koda prioritize in your briefs?",
  },
]

const YEAR_OPTIONS = ["Freshman", "Sophomore", "Junior", "Senior", "Graduate"]

const ROLE_OPTIONS = ["PM", "SWE", "Design", "Data", "Startup Ops", "Research", "Marketing", "Other"]
const INDUSTRY_OPTIONS = ["Tech", "Finance", "Healthcare", "AI / ML", "Consumer", "B2B SaaS", "Other"]
const COMPANY_SIZE_OPTIONS = [
  { value: "startup", label: "Startups (< 50 people)" },
  { value: "growth", label: "Growth stage (50-500)" },
  { value: "big_tech", label: "Big tech / large companies" },
  { value: "any", label: "Open to any size" },
]
const LOCATION_OPTIONS = ["San Francisco", "New York", "Seattle", "Austin", "Los Angeles", "Remote", "Open to anything"]
const FOCUS_OPTIONS = [
  { value: "land_internship", label: "Land an internship this semester" },
  { value: "land_fulltime", label: "Land a full-time role" },
  { value: "build_network", label: "Build my professional network" },
  { value: "explore_options", label: "Explore what is out there" },
  { value: "startup_roles", label: "Find early-stage startup roles" },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: "",
    school: "",
    year: "",
    target_roles: [] as string[],
    target_companies: "",
    industries: [] as string[],
    company_size: "",
    locations: [] as string[],
    work_auth: "",
    resume_text: "",
    linkedin_url: "",
    semester_goal: "",
    focus: [] as string[],
  })

  function update(field: string, value: string | string[]) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function toggleChip(field: "target_roles" | "industries" | "locations" | "focus", value: string) {
    setForm((prev) => {
      const arr = prev[field]
      if (arr.includes(value)) {
        return { ...prev, [field]: arr.filter((v) => v !== value) }
      }
      return { ...prev, [field]: [...arr, value] }
    })
  }

  async function handleSubmit() {
    setError(null)
    setLoading(true)
    try {
      await saveProfile({
        name: form.name,
        school: form.school,
        year: form.year,
        target_roles: form.target_roles.join(", "),
        target_companies: form.target_companies,
        industries: form.industries.join(", "),
        locations: form.locations.join(", "),
        work_auth: form.work_auth,
        resume_text: form.resume_text,
        linkedin_url: form.linkedin_url,
        semester_goal: form.focus.length > 0
          ? form.focus.map(f => FOCUS_OPTIONS.find(o => o.value === f)?.label).filter(Boolean).join(". ") +
            (form.semester_goal ? ". " + form.semester_goal : "")
          : form.semester_goal,
        contacts_notes: "",
      })
      router.push("/inbox")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="grain fixed inset-0 pointer-events-none" />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-12 sm:py-16">
        <div className="w-full max-w-lg">
          {/* Header */}
          <div
            className="flex flex-col items-center mb-10 page-enter"
            style={{ animationDelay: "0ms" }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="status-dot" />
              <h1 className="text-3xl font-heading font-semibold tracking-tight text-foreground">
                Koda
              </h1>
            </div>
            <p className="text-muted-foreground text-sm">
              Set up your profile so Koda can prepare your first brief.
            </p>
          </div>

          {/* Progress indicator */}
          <div
            className="mb-8 page-enter"
            style={{ animationDelay: "60ms" }}
          >
            <div className="flex items-center justify-between mb-4">
              {STEPS.map((s, i) => {
                const isLineCompleted = i < step
                const isLineCurrent = i === step
                return (
                  <div key={i} className="flex items-center flex-1 last:flex-none">
                    <button
                      type="button"
                      onClick={() => {
                        if (i < step) setStep(i)
                      }}
                      aria-label={`Step ${i + 1}: ${s.title}${i < step ? " (completed)" : i === step ? " (current)" : ""}`}
                      className={`flex flex-col items-center gap-1.5 group ${
                        i < step ? "cursor-pointer" : "cursor-default"
                      }`}
                    >
                      <div
                        className={`flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all duration-300 font-system text-[11px] ${
                          i < step
                            ? "border-primary bg-primary text-primary-foreground"
                            : i === step
                              ? "border-primary bg-background text-primary"
                              : "border-border bg-background text-muted-foreground"
                        }`}
                      >
                        {i < step ? (
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        ) : (
                          String(i + 1).padStart(2, "0")
                        )}
                      </div>
                      <span
                        className={`hidden sm:block text-[10px] font-system transition-colors ${
                          i <= step ? "text-primary" : "text-muted-foreground/60"
                        }`}
                      >
                        {s.title}
                      </span>
                    </button>
                    {i < STEPS.length - 1 && (
                      <div className="flex-1 mx-1.5 h-[2px] rounded-full relative">
                        <div className="absolute inset-0 bg-border rounded-full" />
                        <div
                          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out ${
                            isLineCompleted
                              ? "bg-primary w-full"
                              : isLineCurrent
                                ? "bg-primary/30 w-full"
                                : "bg-transparent w-0"
                          }`}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="text-center mt-2">
              <p className="font-system text-primary">
                {STEPS[step].label} &middot; {STEPS[step].slug}
              </p>
            </div>
          </div>

          {/* Card */}
          <div
            key={step}
            className="rounded-xl border border-border bg-card page-enter"
            style={{ animationDelay: "120ms" }}
          >
            <div className="px-6 pt-6 pb-2 sm:px-8 sm:pt-8">
              <h2 className="text-2xl font-heading font-semibold tracking-tight text-foreground">
                {STEPS[step].title}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {STEPS[step].description}
              </p>
            </div>

            <div className="px-6 pt-4 pb-4 sm:px-8 space-y-5">
              {/* Step 1: About You */}
              {step === 0 && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      placeholder="Your full name"
                      value={form.name}
                      onChange={(e) => update("name", e.target.value)}
                      className="h-11 rounded-lg"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="school">School</Label>
                    <Input
                      id="school"
                      placeholder="Your university"
                      value={form.school}
                      onChange={(e) => update("school", e.target.value)}
                      className="h-11 rounded-lg"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Year</Label>
                    <Select
                      value={form.year}
                      onValueChange={(val) => update("year", val ?? "")}
                    >
                      <SelectTrigger className="w-full h-11 rounded-lg">
                        <SelectValue placeholder="Select your year" />
                      </SelectTrigger>
                      <SelectContent>
                        {YEAR_OPTIONS.map((yr) => (
                          <SelectItem key={yr} value={yr}>
                            {yr}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {/* Step 2: What You Want */}
              {step === 1 && (
                <>
                  <div className="space-y-2.5">
                    <Label>What roles interest you?</Label>
                    <div className="flex flex-wrap gap-2">
                      {ROLE_OPTIONS.map((role) => (
                        <ChipToggle
                          key={role}
                          label={role}
                          selected={form.target_roles.includes(role)}
                          onClick={() => toggleChip("target_roles", role)}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    <Label>What industries?</Label>
                    <div className="flex flex-wrap gap-2">
                      {INDUSTRY_OPTIONS.map((ind) => (
                        <ChipToggle
                          key={ind}
                          label={ind}
                          selected={form.industries.includes(ind)}
                          onClick={() => toggleChip("industries", ind)}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Skip if you are open to anything.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Company size preference</Label>
                    <Select
                      value={form.company_size}
                      onValueChange={(val) => update("company_size", val ?? "")}
                    >
                      <SelectTrigger className="w-full h-11 rounded-lg">
                        <SelectValue placeholder="Any size" />
                      </SelectTrigger>
                      <SelectContent>
                        {COMPANY_SIZE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2.5">
                    <Label>Where do you want to work?</Label>
                    <div className="flex flex-wrap gap-2">
                      {LOCATION_OPTIONS.map((loc) => (
                        <ChipToggle
                          key={loc}
                          label={loc}
                          selected={form.locations.includes(loc)}
                          onClick={() => toggleChip("locations", loc)}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Skip if location does not matter.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="target_companies">
                      Any specific companies?
                    </Label>
                    <Input
                      id="target_companies"
                      placeholder="e.g. Stripe, Notion, Figma"
                      value={form.target_companies}
                      onChange={(e) => update("target_companies", e.target.value)}
                      className="h-11 rounded-lg"
                    />
                    <p className="text-xs text-muted-foreground">
                      Optional. Koda will also find companies you have not thought of.
                    </p>
                  </div>
                </>
              )}

              {/* Step 3: Your Experience */}
              {step === 2 && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="linkedin_url">LinkedIn</Label>
                    <Input
                      id="linkedin_url"
                      placeholder="https://linkedin.com/in/yourname"
                      value={form.linkedin_url}
                      onChange={(e) => update("linkedin_url", e.target.value)}
                      className="h-11 rounded-lg"
                    />
                    <p className="text-xs text-muted-foreground">
                      Optional. Helps Koda reference your experience in outreach drafts.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="resume_text">Experience summary</Label>
                    <Textarea
                      id="resume_text"
                      placeholder="Paste your resume text, LinkedIn summary, or describe what you have built. A few bullet points is fine."
                      value={form.resume_text}
                      onChange={(e) => update("resume_text", e.target.value)}
                      rows={5}
                      className="rounded-lg"
                    />
                    <p className="text-xs text-muted-foreground">
                      Optional. The more Koda knows, the more specific your briefs will be.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Work authorization</Label>
                    <Select
                      value={form.work_auth}
                      onValueChange={(val) => update("work_auth", val ?? "")}
                    >
                      <SelectTrigger className="w-full h-11 rounded-lg">
                        <SelectValue placeholder="Select if relevant" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="us_citizen">US Citizen</SelectItem>
                        <SelectItem value="permanent_resident">Permanent Resident</SelectItem>
                        <SelectItem value="f1_opt">F-1 OPT / CPT</SelectItem>
                        <SelectItem value="h1b">H-1B</SelectItem>
                        <SelectItem value="other_visa">Other visa</SelectItem>
                        <SelectItem value="not_applicable">Not applicable</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Optional. Helps Koda filter for roles that match your status.
                    </p>
                  </div>
                </>
              )}

              {/* Step 4: Focus */}
              {step === 3 && (
                <>
                  <div className="space-y-2.5">
                    <Label>What are you focused on right now?</Label>
                    <div className="flex flex-col gap-2">
                      {FOCUS_OPTIONS.map((opt) => (
                        <ChipToggle
                          key={opt.value}
                          label={opt.label}
                          selected={form.focus.includes(opt.value)}
                          onClick={() => toggleChip("focus", opt.value)}
                          fullWidth
                        />
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Pick as many as apply. This helps Koda prioritize your moves.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="semester_goal">Anything else Koda should know?</Label>
                    <Textarea
                      id="semester_goal"
                      placeholder="e.g. I'm most interested in AI startups, I want to break into PM from engineering, I'm recruiting for summer 2027..."
                      value={form.semester_goal}
                      onChange={(e) => update("semester_goal", e.target.value)}
                      rows={3}
                      className="rounded-lg"
                    />
                    <p className="text-xs text-muted-foreground">
                      Optional. Free-form context for your briefs.
                    </p>
                  </div>
                </>
              )}

              {error && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-6 py-5 sm:px-8">
              <Button
                variant="outline"
                onClick={() => setStep((s) => s - 1)}
                disabled={step === 0}
                className="rounded-lg"
              >
                Back
              </Button>

              {step < STEPS.length - 1 ? (
                <Button
                  onClick={() => setStep((s) => s + 1)}
                  className="rounded-lg"
                >
                  Next
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="rounded-lg bg-primary text-primary-foreground hover:bg-[#075B59]"
                >
                  {loading ? "Saving..." : "Start recruiting"}
                </Button>
              )}
            </div>
          </div>

          {/* Footer */}
          <div
            className="mt-6 text-center page-enter"
            style={{ animationDelay: "180ms" }}
          >
            <p className="font-system text-muted-foreground">
              Everything is optional except your name &middot; You can update this anytime
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function ChipToggle({
  label,
  selected,
  onClick,
  fullWidth,
}: {
  label: string
  selected: boolean
  onClick: () => void
  fullWidth?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${fullWidth ? "w-full text-left" : ""} inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
        selected
          ? "border-primary bg-accent text-primary font-medium"
          : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
      }`}
    >
      {selected && (
        <svg className="size-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
      {label}
    </button>
  )
}

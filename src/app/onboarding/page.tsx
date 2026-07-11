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
    description: "Let's start with the basics",
  },
  {
    title: "Targets",
    label: "step 02",
    slug: "your targets",
    description: "What are you aiming for?",
  },
  {
    title: "Background",
    label: "step 03",
    slug: "your background",
    description: "Help us understand your experience",
  },
  {
    title: "Goals",
    label: "step 04",
    slug: "your goals",
    description: "What does success look like?",
  },
]

const YEAR_OPTIONS = ["Freshman", "Sophomore", "Junior", "Senior", "Graduate"]

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: "",
    school: "",
    year: "",
    target_roles: "",
    target_companies: "",
    industries: "",
    locations: "",
    work_auth: "",
    resume_text: "",
    linkedin_url: "",
    semester_goal: "",
    contacts_notes: "",
  })

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit() {
    setError(null)
    setLoading(true)
    try {
      await saveProfile(form)
      router.push("/inbox")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Grain overlay */}
      <div className="grain fixed inset-0 pointer-events-none" />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-12 sm:py-16">
        <div className="w-full max-w-lg">
          {/* Header: status-dot + Koda branding */}
          <div
            className="flex flex-col items-center mb-10 page-enter"
            style={{ animationDelay: "0ms" }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="status-dot" />
              <h1 className="text-3xl font-heading font-bold tracking-tight text-foreground">
                Koda
              </h1>
            </div>
            <p className="text-muted-foreground text-sm">
              Let&apos;s set up your recruiting profile
            </p>
          </div>

          {/* Editorial progress indicator */}
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
            className="rounded-xl border border-border bg-card shadow-sm page-enter"
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

              {step === 1 && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="target_roles">Target Roles</Label>
                    <Input
                      id="target_roles"
                      placeholder="PM, SWE, startup ops..."
                      value={form.target_roles}
                      onChange={(e) => update("target_roles", e.target.value)}
                      className="h-11 rounded-lg"
                    />
                    <p className="text-xs text-muted-foreground">
                      Separate multiple roles with commas
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="target_companies">Target Companies</Label>
                    <Input
                      id="target_companies"
                      placeholder="Google, Stripe, Notion..."
                      value={form.target_companies}
                      onChange={(e) => update("target_companies", e.target.value)}
                      className="h-11 rounded-lg"
                    />
                    <p className="text-xs text-muted-foreground">
                      Separate multiple companies with commas
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="industries">Industries</Label>
                    <Input
                      id="industries"
                      placeholder="Tech, Finance, Healthcare..."
                      value={form.industries}
                      onChange={(e) => update("industries", e.target.value)}
                      className="h-11 rounded-lg"
                    />
                    <p className="text-xs text-muted-foreground">
                      Separate multiple industries with commas
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="locations">Locations</Label>
                    <Input
                      id="locations"
                      placeholder="San Francisco, New York, Remote..."
                      value={form.locations}
                      onChange={(e) => update("locations", e.target.value)}
                      className="h-11 rounded-lg"
                    />
                    <p className="text-xs text-muted-foreground">
                      Separate multiple locations with commas
                    </p>
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="work_auth">Work Authorization</Label>
                    <Input
                      id="work_auth"
                      placeholder="e.g. US Citizen, F-1 OPT, H-1B..."
                      value={form.work_auth}
                      onChange={(e) => update("work_auth", e.target.value)}
                      className="h-11 rounded-lg"
                    />
                    <p className="text-xs text-muted-foreground">Optional</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="resume_text">Resume</Label>
                    <Textarea
                      id="resume_text"
                      placeholder="Paste your resume or a summary"
                      value={form.resume_text}
                      onChange={(e) => update("resume_text", e.target.value)}
                      rows={6}
                      className="rounded-lg"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="linkedin_url">LinkedIn URL</Label>
                    <Input
                      id="linkedin_url"
                      placeholder="https://linkedin.com/in/yourname"
                      value={form.linkedin_url}
                      onChange={(e) => update("linkedin_url", e.target.value)}
                      className="h-11 rounded-lg"
                    />
                    <p className="text-xs text-muted-foreground">Optional</p>
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="semester_goal">Semester Goal</Label>
                    <Textarea
                      id="semester_goal"
                      placeholder="What kind of opportunity would make this semester successful?"
                      value={form.semester_goal}
                      onChange={(e) => update("semester_goal", e.target.value)}
                      rows={4}
                      className="rounded-lg"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contacts_notes">Existing Contacts</Label>
                    <Textarea
                      id="contacts_notes"
                      placeholder="Anyone you already know in the industry?"
                      value={form.contacts_notes}
                      onChange={(e) => update("contacts_notes", e.target.value)}
                      rows={3}
                      className="rounded-lg"
                    />
                    <p className="text-xs text-muted-foreground">Optional</p>
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
                  className="rounded-lg run-glow"
                >
                  {loading ? "Saving..." : "Start recruiting"}
                </Button>
              )}
            </div>
          </div>

          {/* Footer hint */}
          <div
            className="mt-6 text-center page-enter"
            style={{ animationDelay: "180ms" }}
          >
            <p className="font-system text-muted-foreground">
              Your data stays private &middot; You can update this anytime
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

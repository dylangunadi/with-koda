"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { saveProfile } from "./actions"

const STEPS = [
  { title: "Identity", description: "Who is Koda working for?" },
  { title: "Targets", description: "Where should Koda look?" },
  { title: "Background", description: "What has Koda got to work with?" },
  { title: "Objectives", description: "What should Koda optimize for?" },
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
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background px-4 py-12 sm:px-6">
      <div className="grain pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="pointer-events-none absolute -top-36 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-primary/8 blur-3xl dark:bg-primary/10" aria-hidden="true" />

      <div className="relative z-10 w-full max-w-xl page-enter">
        <div className="text-center mb-8 stagger-1">
          <div className="mb-4 flex items-center justify-center gap-2 font-system text-primary">
            <span className="status-dot" />
            <span>// agent intelligence briefing</span>
          </div>
          <h1 className="flex items-center justify-center gap-3 text-4xl font-heading font-semibold tracking-tight text-foreground">
            <span className="status-dot" /> Koda
          </h1>
          <p className="mt-2 text-muted-foreground text-sm">
            Teach your agent what opportunity looks like
          </p>
        </div>

        {/* Progress indicator */}
        <div className="mb-8 grid grid-cols-4 gap-2 stagger-2">
          {STEPS.map((item, i) => (
            <div
              key={i}
              className="min-w-0 text-center"
            >
              <div
                className={`mx-auto mb-2 h-1.5 rounded-full transition-all duration-300 ${
                  i <= step
                    ? "bg-primary w-full"
                    : "bg-muted w-3/4"
                }`}
              />
              <span className={`font-system transition-colors ${
                i === step ? "text-primary" : "text-muted-foreground"
              }`}>
                {item.title}
              </span>
            </div>
          ))}
        </div>

        <Card key={step} className="briefing-accent page-enter relative overflow-hidden border-border/70 bg-card/90 shadow-xl shadow-primary/5 backdrop-blur-sm before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary">
          <CardHeader className="pl-8">
            <div className="font-system text-primary">
              // agent calibration — step {step + 1}
            </div>
            <CardTitle className="text-2xl tracking-tight">{STEPS[step].title}</CardTitle>
            <CardDescription>{STEPS[step].description}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-5 pl-8">
            {step === 0 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    placeholder="Your full name"
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="school">School</Label>
                  <Input
                    id="school"
                    placeholder="Your university"
                    value={form.school}
                    onChange={(e) => update("school", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Year</Label>
                  <Select
                    value={form.year}
                    onValueChange={(val) => update("year", val ?? "")}
                  >
                    <SelectTrigger className="w-full">
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
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="linkedin_url">LinkedIn URL</Label>
                  <Input
                    id="linkedin_url"
                    placeholder="https://linkedin.com/in/yourname"
                    value={form.linkedin_url}
                    onChange={(e) => update("linkedin_url", e.target.value)}
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
                  />
                  <p className="text-xs text-muted-foreground">Optional</p>
                </div>
              </>
            )}

            {error && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
          </CardContent>

          <div className="flex items-center justify-between px-6 pb-6 pl-8">
            <Button
              variant="outline"
              onClick={() => setStep((s) => s - 1)}
              disabled={step === 0}
            >
              Back
            </Button>

            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep((s) => s + 1)}>Next</Button>
            ) : (
              <Button onClick={handleSubmit} disabled={loading}>
                {loading ? "Saving..." : "Deploy Koda"}
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

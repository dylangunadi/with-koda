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
  { title: "About You", description: "Let's start with the basics" },
  { title: "Targets", description: "What are you aiming for?" },
  { title: "Background", description: "Help us understand your experience" },
  { title: "Goals", description: "What does success look like?" },
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
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-lg page-enter">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-heading font-semibold tracking-tight text-foreground">
            Koda
          </h1>
          <p className="mt-2 text-muted-foreground text-sm">
            Let's set up your recruiting profile
          </p>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i <= step
                  ? "bg-primary w-8"
                  : "bg-muted w-6"
              }`}
            />
          ))}
        </div>
        <p className="text-center text-xs text-muted-foreground mb-6">
          Step {step + 1} of {STEPS.length}
        </p>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{STEPS[step].title}</CardTitle>
            <CardDescription>{STEPS[step].description}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
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

          <div className="flex items-center justify-between px-6 pb-6">
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
                {loading ? "Saving..." : "Start recruiting"}
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

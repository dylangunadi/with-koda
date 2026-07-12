"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
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
import { saveProfile } from "@/app/onboarding/actions"
import type { Profile } from "@/lib/types"

const YEAR_OPTIONS = ["Freshman", "Sophomore", "Junior", "Senior", "Graduate"]

export default function SettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [resumeFileName, setResumeFileName] = useState("")
  const [resumeFileError, setResumeFileError] = useState<string | null>(null)
  const [briefNotice, setBriefNotice] = useState<string | null>(null)
  const [savedBrief, setSavedBrief] = useState({ enabled: false, confirmed: false, frequency: "daily", email: "" })

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
    focus_options: [] as string[],
    semester_goal: "",
    autonomous_enabled: false,
    brief_frequency: "daily",
    brief_email: "",
  })

  useEffect(() => {
    async function loadProfile() {
      const briefStatus = new URLSearchParams(window.location.search).get("brief")
      if (briefStatus === "confirmed") setBriefNotice("Your email is confirmed. Autonomous briefs are now active.")
      if (briefStatus === "invalid") setError("That confirmation link is invalid or expired. Enable briefs again to request a new one.")

      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push("/login")
        return
      }

      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single<Profile>()

      if (data) {
        const briefSettings = {
          enabled: data.autonomous_enabled ?? false,
          confirmed: data.brief_confirmed ?? false,
          frequency: data.brief_frequency ?? "daily",
          email: data.brief_email ?? "",
        }
        setSavedBrief(briefSettings)
        setForm({
          name: data.name ?? "",
          school: data.school ?? "",
          year: data.year ?? "",
          target_roles: (data.target_roles ?? []).join(", "),
          target_companies: (data.target_companies ?? []).join(", "),
          industries: (data.industries ?? []).join(", "),
          locations: (data.locations ?? []).join(", "),
          work_auth: data.work_auth ?? "",
          resume_text: data.resume_text ?? "",
          linkedin_url: data.linkedin_url ?? "",
          focus_options: data.focus_options ?? [],
          semester_goal: data.semester_goal ?? "",
          autonomous_enabled: data.autonomous_enabled ?? false,
          brief_frequency: data.brief_frequency ?? "daily",
          brief_email: data.brief_email ?? "",
        })
      }

      setLoading(false)
    }

    loadProfile()
  }, [router])

  function update(field: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setSuccess(false)
    setBriefNotice(null)
  }

  function handleResumeUpload(file: File | undefined) {
    if (!file) return

    setResumeFileError(null)
    const reader = new FileReader()
    reader.onload = () => {
      update("resume_text", typeof reader.result === "string" ? reader.result : "")
      setResumeFileName(file.name)
    }
    reader.onerror = () => {
      setResumeFileError("We could not read that file. Please try another one.")
    }
    reader.readAsText(file)
  }

  async function handleSave() {
    setError(null)
    setSuccess(false)
    setSaving(true)
    try {
      const splitCommas = (s: string) => s.split(",").map(v => v.trim()).filter(Boolean)
      const briefChanged = form.brief_frequency !== savedBrief.frequency || form.brief_email.trim() !== savedBrief.email
      const needsConfirmation = form.autonomous_enabled && (!savedBrief.enabled || !savedBrief.confirmed || briefChanged)
      await saveProfile({
        ...form,
        autonomous_enabled: needsConfirmation ? false : form.autonomous_enabled,
        target_roles: splitCommas(form.target_roles),
        industries: splitCommas(form.industries),
        locations: splitCommas(form.locations),
      })

      if (needsConfirmation || !form.autonomous_enabled) {
        const response = await fetch("/api/briefs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enabled: form.autonomous_enabled,
            email: form.brief_email,
            frequency: form.brief_frequency,
          }),
        })
        const result = await response.json() as { error?: string }
        if (!response.ok) throw new Error(result.error || "Could not update autonomous briefs")
        if (needsConfirmation) {
          setBriefNotice("Check your email to confirm briefs. They will remain off until you confirm.")
          setSavedBrief((prev) => ({ ...prev, enabled: false, confirmed: false }))
        } else {
          setSavedBrief((prev) => ({ ...prev, enabled: false, confirmed: false }))
        }
      } else {
        setSavedBrief({
          enabled: form.autonomous_enabled,
          confirmed: savedBrief.confirmed,
          frequency: form.brief_frequency,
          email: form.brief_email.trim(),
        })
      }
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="status-dot" />
        <p className="font-system text-muted-foreground">Loading profile</p>
      </div>
    )
  }

  return (
    <div className="page-enter">
      <div className="mb-10">
        <p className="font-system text-primary mb-2">Profile settings</p>
        <h1 className="text-2xl font-heading font-bold tracking-tight text-foreground">
          Your Recruiting Profile
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Keep this updated so Koda generates better moves for you.
        </p>
      </div>

      <div className="space-y-8">
        {/* About You */}
        <div className="page-enter" style={{ animationDelay: "60ms" }}>
          <p className="font-system text-primary mb-3">About you</p>
          <div className="rounded-xl border border-border bg-card shadow-sm p-6 space-y-4">
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
          </div>
        </div>

        {/* Targets */}
        <div className="page-enter" style={{ animationDelay: "120ms" }}>
          <p className="font-system text-primary mb-3">Targets</p>
          <div className="rounded-xl border border-border bg-card shadow-sm p-6 space-y-4">
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
          </div>
        </div>

        {/* Background */}
        <div className="page-enter" style={{ animationDelay: "180ms" }}>
          <p className="font-system text-primary mb-3">Background</p>
          <div className="rounded-xl border border-border bg-card shadow-sm p-6 space-y-4">
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
              <Label htmlFor="resume_file">Resume</Label>
              <Input
                id="resume_file"
                type="file"
                accept=".pdf,.txt,.doc,.docx"
                onChange={(e) => handleResumeUpload(e.target.files?.[0])}
                className="h-11 rounded-lg file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium"
              />
              <p className="text-xs text-muted-foreground">
                Upload a PDF, TXT, DOC, or DOCX file to replace your current resume.
              </p>
              {resumeFileError && (
                <p className="text-xs text-destructive">{resumeFileError}</p>
              )}
              {form.resume_text && (
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="mb-1 text-xs font-medium text-foreground">
                    {resumeFileName || "Current resume preview"}
                  </p>
                  <p className="max-h-32 overflow-hidden whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                    {form.resume_text.slice(0, 1000)}
                    {form.resume_text.length > 1000 ? "…" : ""}
                  </p>
                </div>
              )}
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
          </div>
        </div>

        {/* Goals */}
        <div className="page-enter" style={{ animationDelay: "240ms" }}>
          <p className="font-system text-primary mb-3">Goals</p>
          <div className="rounded-xl border border-border bg-card shadow-sm p-6 space-y-4">
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
          </div>
        </div>

        {/* Autonomous Briefs */}
        <div className="page-enter" style={{ animationDelay: "300ms" }}>
          <p className="font-system text-primary mb-3">Autonomous briefs</p>
          <div className="rounded-xl border border-border bg-card shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="autonomous_enabled">Scheduled Koda Briefs</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Off means manual only: you run Koda from your inbox when you
                  want a brief. On, Koda prepares briefs on a schedule and can
                  email you a digest.
                </p>
              </div>
              <button
                id="autonomous_enabled"
                role="switch"
                aria-checked={form.autonomous_enabled}
                onClick={() => update("autonomous_enabled", !form.autonomous_enabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  form.autonomous_enabled ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    form.autonomous_enabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            {form.autonomous_enabled && (
              <div className="space-y-4 border-t border-border/40 pt-4" style={{ animation: "fadeSlideIn 180ms ease-out" }}>
                <div className="space-y-2">
                  <Label>Frequency</Label>
                  <Select
                    value={["daily", "weekly"].includes(form.brief_frequency) ? form.brief_frequency : "daily"}
                    onValueChange={(val) => update("brief_frequency", val ?? "daily")}
                  >
                    <SelectTrigger className="w-full h-11 rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly (Monday)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="brief_email">Brief Email</Label>
                  <Input
                    id="brief_email"
                    type="email"
                    placeholder="you@school.edu"
                    value={form.brief_email}
                    onChange={(e) => update("brief_email", e.target.value)}
                    className="h-11 rounded-lg"
                  />
                  <p className="text-xs text-muted-foreground">
                    Where to send your autonomous brief digest
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Status messages */}
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-lg bg-primary/10 border border-primary/20 px-4 py-3 text-sm text-primary flex items-center gap-2">
            <div className="status-dot" />
            Profile saved successfully.
          </div>
        )}

        {briefNotice && (
          <div className="rounded-lg bg-primary/10 border border-primary/20 px-4 py-3 text-sm text-primary">
            {briefNotice}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end page-enter" style={{ animationDelay: "360ms" }}>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="h-11 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity px-8"
          >
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
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
import { saveProfile } from "@/app/onboarding/actions"
import type { Profile } from "@/lib/types"

const YEAR_OPTIONS = ["Freshman", "Sophomore", "Junior", "Senior", "Graduate"]

export default function SettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

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
    autonomous_enabled: false,
    brief_frequency: "daily",
    brief_email: "",
  })

  useEffect(() => {
    async function loadProfile() {
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
          semester_goal: data.semester_goal ?? "",
          contacts_notes: data.contacts_notes ?? "",
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
  }

  async function handleSave() {
    setError(null)
    setSuccess(false)
    setSaving(true)
    try {
      await saveProfile(form)
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-muted-foreground text-sm">Loading profile...</p>
      </div>
    )
  }

  return (
    <div className="page-enter">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-heading font-semibold tracking-tight">
            Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Update your recruiting profile
          </p>
        </div>
        <Link href="/inbox">
          <Button variant="outline" size="sm">
            Back to Inbox
          </Button>
        </Link>
      </div>

      <div className="space-y-6">
        {/* About You */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">About You</CardTitle>
            <CardDescription>Your basic information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
          </CardContent>
        </Card>

        {/* Targets */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Targets</CardTitle>
            <CardDescription>What are you aiming for?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
          </CardContent>
        </Card>

        {/* Background */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Background</CardTitle>
            <CardDescription>
              Help us understand your experience
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
          </CardContent>
        </Card>

        {/* Goals */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Goals</CardTitle>
            <CardDescription>What does success look like?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
          </CardContent>
        </Card>

        {/* Autonomous Briefs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Autonomous Briefs</CardTitle>
            <CardDescription>
              Let Koda generate and email you recruiting moves on a schedule
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="autonomous_enabled">Enable Autonomous Briefs</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Koda will generate moves and email you a digest
                </p>
              </div>
              <button
                id="autonomous_enabled"
                role="switch"
                aria-checked={form.autonomous_enabled}
                onClick={() => update("autonomous_enabled", !form.autonomous_enabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
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
              <>
                <div className="space-y-2">
                  <Label>Frequency</Label>
                  <Select
                    value={form.brief_frequency}
                    onValueChange={(val) => update("brief_frequency", val ?? "daily")}
                  >
                    <SelectTrigger className="w-full">
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
                  />
                  <p className="text-xs text-muted-foreground">
                    Where to send your autonomous brief digest
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-md bg-primary/10 border border-primary/20 px-3 py-2 text-sm text-primary">
            Profile saved successfully.
          </div>
        )}

        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={handleSignOut}
            className="text-destructive hover:text-destructive"
          >
            Sign Out
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  )
}

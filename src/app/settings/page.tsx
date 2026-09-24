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
import { updateProfile } from "@/app/settings/actions"
import type { Profile } from "@/lib/types"

// Same fields and labels as the onboarding review (ReviewConfirm), so Settings
// edits exactly what chat onboarding collected.
type ProfileField =
  | "name"
  | "school"
  | "year"
  | "target_roles"
  | "target_companies"
  | "locations"
  | "work_auth"
  | "recruiting_stage"
  | "timeline"
  | "contacts"
  | "proof_points"
  | "success_definition"

const SECTIONS: { title: string; fields: { key: ProfileField; label: string; textarea?: boolean }[] }[] = [
  {
    title: "About you",
    fields: [
      { key: "name", label: "Name" },
      { key: "school", label: "School" },
      { key: "year", label: "Year" },
    ],
  },
  {
    title: "Targets",
    fields: [
      { key: "target_roles", label: "Target roles (comma separated)" },
      { key: "target_companies", label: "Target companies (comma separated)" },
      { key: "locations", label: "Locations (comma separated)" },
    ],
  },
  {
    title: "Situation",
    fields: [
      { key: "work_auth", label: "Work authorization" },
      { key: "recruiting_stage", label: "Recruiting stage" },
      { key: "timeline", label: "Timing and deadlines" },
    ],
  },
  {
    title: "People, proof, and goals",
    fields: [
      { key: "contacts", label: "People you already know", textarea: true },
      { key: "proof_points", label: "Projects and proof of work", textarea: true },
      { key: "success_definition", label: "What success looks like", textarea: true },
    ],
  },
]

export default function SettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [briefNotice, setBriefNotice] = useState<string | null>(null)
  const [savedBrief, setSavedBrief] = useState({ enabled: false, confirmed: false, frequency: "daily", email: "" })

  const [form, setForm] = useState({
    name: "",
    school: "",
    year: "",
    target_roles: "",
    target_companies: "",
    locations: "",
    work_auth: "",
    recruiting_stage: "",
    timeline: "",
    contacts: "",
    proof_points: "",
    success_definition: "",
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
          locations: (data.locations ?? []).join(", "),
          work_auth: data.work_auth ?? "",
          recruiting_stage: data.recruiting_stage ?? "",
          timeline: data.timeline ?? "",
          contacts: data.contacts_notes ?? "",
          proof_points: data.proof_points ?? "",
          success_definition: data.success_definition ?? "",
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

  async function handleSave() {
    setError(null)
    setSuccess(false)
    setSaving(true)
    try {
      const splitCommas = (s: string) => s.split(",").map(v => v.trim()).filter(Boolean)
      // Profile fields only; scheduled-brief consent and email are managed
      // exclusively by /api/briefs below.
      const saved = await updateProfile({
        name: form.name,
        school: form.school,
        year: form.year,
        target_roles: splitCommas(form.target_roles),
        target_companies: splitCommas(form.target_companies),
        locations: splitCommas(form.locations),
        work_auth: form.work_auth,
        recruiting_stage: form.recruiting_stage,
        timeline: form.timeline,
        contacts: form.contacts,
        proof_points: form.proof_points,
        success_definition: form.success_definition,
      })
      if (!saved.success) throw new Error(saved.error || "Could not save your profile")

      const frequency = ["daily", "weekly"].includes(form.brief_frequency) ? form.brief_frequency : "daily"
      const email = form.brief_email.trim()
      const briefChanged =
        form.autonomous_enabled !== savedBrief.enabled ||
        (form.autonomous_enabled && (frequency !== savedBrief.frequency || email !== savedBrief.email))

      if (briefChanged) {
        const response = await fetch("/api/briefs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enabled: form.autonomous_enabled,
            email,
            frequency,
          }),
        })
        const result = await response.json().catch(() => ({})) as { error?: string; enabled?: boolean; pending?: boolean; emailDigest?: boolean }
        if (!response.ok) throw new Error(result.error || "Could not update scheduled briefs")
        if (result.pending) {
          setBriefNotice("Scheduled briefs are on. Check your email to confirm the digest; no email is sent until you confirm.")
          setSavedBrief({ enabled: true, confirmed: false, frequency, email: "" })
        } else if (result.enabled) {
          setSavedBrief({
            enabled: true,
            confirmed: Boolean(result.emailDigest),
            frequency,
            email: result.emailDigest ? email : "",
          })
        } else {
          setSavedBrief({ enabled: false, confirmed: false, frequency: "manual", email: "" })
        }
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
        {SECTIONS.map((section, i) => (
          <div key={section.title} className="page-enter" style={{ animationDelay: `${60 * (i + 1)}ms` }}>
            <p className="font-system text-primary mb-3">{section.title}</p>
            <div className="rounded-xl border border-border bg-card shadow-sm p-6 space-y-4">
              {section.fields.map((f) => (
                <div key={f.key} className="space-y-2">
                  <Label htmlFor={f.key}>{f.label}</Label>
                  {f.textarea ? (
                    <Textarea
                      id={f.key}
                      value={form[f.key]}
                      onChange={(e) => update(f.key, e.target.value)}
                      rows={3}
                      className="rounded-lg"
                    />
                  ) : (
                    <Input
                      id={f.key}
                      value={form[f.key]}
                      onChange={(e) => update(f.key, e.target.value)}
                      className="h-11 rounded-lg"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

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

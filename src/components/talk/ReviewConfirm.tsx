"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { confirmOnboarding, type ReviewedProfile } from "@/app/talk/actions";
import { toast } from "sonner";
import type { OnboardingExtracted } from "@/lib/types";

interface ReviewConfirmProps {
  extracted: OnboardingExtracted;
  onDone: () => void;
}

const FREQUENCIES: { value: ReviewedProfile["brief_frequency"]; label: string; hint: string }[] = [
  { value: "manual", label: "Manual only", hint: "You run Koda when you want a new brief." },
  { value: "weekly", label: "Weekly brief", hint: "Koda prepares a brief every Monday." },
  { value: "daily", label: "Daily brief", hint: "Koda prepares a brief every morning." },
];

export function ReviewConfirm({ extracted, onDone }: ReviewConfirmProps) {
  const [form, setForm] = useState({
    name: extracted.name ?? "",
    school: extracted.school ?? "",
    year: extracted.year ?? "",
    target_roles: (extracted.target_roles ?? []).join(", "),
    target_companies: (extracted.target_companies ?? []).join(", "),
    locations: (extracted.locations ?? []).join(", "),
    work_auth: extracted.work_auth ?? "",
    recruiting_stage: extracted.recruiting_stage ?? "",
    timeline: extracted.timeline ?? "",
    contacts: extracted.contacts ?? "",
    proof_points: extracted.proof_points ?? "",
    success_definition: extracted.success_definition ?? "",
  });
  const [frequency, setFrequency] = useState<ReviewedProfile["brief_frequency"]>("manual");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function splitList(value: string): string[] {
    return value.split(",").map((s) => s.trim()).filter(Boolean);
  }

  async function handleConfirm() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await confirmOnboarding({
        name: form.name,
        school: form.school,
        year: form.year,
        target_roles: splitList(form.target_roles),
        target_companies: splitList(form.target_companies),
        locations: splitList(form.locations),
        work_auth: form.work_auth,
        recruiting_stage: form.recruiting_stage,
        timeline: form.timeline,
        contacts: form.contacts,
        proof_points: form.proof_points,
        success_definition: form.success_definition,
        brief_frequency: frequency,
      });
      if (!result.success) {
        setError(result.error ?? "Could not save. Try again.");
        return;
      }
      if (result.briefError) {
        toast.error(result.briefError);
      } else {
        toast.success("Your first Koda Brief is ready.");
      }
      onDone();
    } catch {
      setError("Something went wrong saving your profile. Your answers are still here, try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const fields: { key: keyof typeof form; label: string; textarea?: boolean }[] = [
    { key: "name", label: "Name" },
    { key: "school", label: "School" },
    { key: "year", label: "Year" },
    { key: "target_roles", label: "Target roles (comma separated)" },
    { key: "target_companies", label: "Target companies (comma separated)" },
    { key: "locations", label: "Locations (comma separated)" },
    { key: "work_auth", label: "Work authorization" },
    { key: "recruiting_stage", label: "Recruiting stage" },
    { key: "timeline", label: "Timing and deadlines" },
    { key: "contacts", label: "People you already know", textarea: true },
    { key: "proof_points", label: "Projects and proof of work", textarea: true },
    { key: "success_definition", label: "What success looks like", textarea: true },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-5">
      <div>
        <p className="font-system text-primary mb-1.5">Review</p>
        <h2 className="font-heading text-lg font-semibold text-foreground">
          Here is what Koda learned
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Fix anything that is off. Koda builds your first brief from this.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.key} className={`space-y-1.5 ${f.textarea ? "sm:col-span-2" : ""}`}>
            <Label htmlFor={`review-${f.key}`} className="text-xs font-medium text-muted-foreground">
              {f.label}
            </Label>
            {f.textarea ? (
              <Textarea
                id={`review-${f.key}`}
                value={form[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
                rows={2}
                className="rounded-lg text-sm"
              />
            ) : (
              <Input
                id={`review-${f.key}`}
                value={form[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
                className="h-10 rounded-lg text-sm"
              />
            )}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">How often should Koda run?</p>
        <fieldset className="grid gap-2 sm:grid-cols-3">
          <legend className="sr-only">Brief frequency</legend>
          {FREQUENCIES.map((f) => (
            <label
              key={f.value}
              className={`cursor-pointer rounded-lg border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary ${
                frequency === f.value
                  ? "border-primary bg-accent"
                  : "border-border hover:border-primary/40"
              }`}
            >
              <input
                type="radio"
                name="brief-frequency"
                value={f.value}
                checked={frequency === f.value}
                onChange={() => setFrequency(f.value)}
                className="sr-only"
              />
              <span className="block text-sm font-medium text-foreground">{f.label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{f.hint}</span>
            </label>
          ))}
        </fieldset>
        <p className="text-xs text-muted-foreground">
          Scheduled briefs stay inside Koda. Email delivery is set up separately in Settings.
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {error}
        </div>
      )}

      <Button
        onClick={handleConfirm}
        disabled={submitting || !form.name.trim()}
        className="h-11 w-full rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-[#075B59] transition-colors"
      >
        {submitting ? "Building your first brief..." : "Confirm and build my first brief"}
      </Button>
    </div>
  );
}

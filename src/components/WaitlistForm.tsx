"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [school, setSchool] = useState("");
  const [classYear, setClassYear] = useState("");
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name: name || undefined,
          school: school || undefined,
          classYear: classYear || undefined,
          recruitingStage: role || undefined,
          source: "website",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }

      setSuccess(true);
    } catch {
      setError("Failed to submit. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="rounded-xl border border-primary/20 bg-accent p-8 text-center">
        <div className="flex justify-center mb-3">
          <div className="status-dot" />
        </div>
        <p className="text-lg font-heading font-semibold text-foreground">
          You&apos;re on the list.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          We will reach out when your brief is ready.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-left">
      <div>
        <Label htmlFor="email">Email *</Label>
        <Input
          id="email"
          type="email"
          required
          placeholder="you@school.edu"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 h-11 rounded-lg"
        />
      </div>

      <div>
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 h-11 rounded-lg"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="school">School</Label>
          <Input
            id="school"
            placeholder="UC Berkeley"
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            className="mt-1 h-11 rounded-lg"
          />
        </div>
        <div>
          <Label htmlFor="classYear">Class year</Label>
          <select
            id="classYear"
            value={classYear}
            onChange={(e) => setClassYear(e.target.value)}
            className="mt-1 flex h-11 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">Select</option>
            <option value="Freshman">Freshman</option>
            <option value="Sophomore">Sophomore</option>
            <option value="Junior">Junior</option>
            <option value="Senior">Senior</option>
            <option value="Graduate">Graduate</option>
          </select>
        </div>
      </div>

      <div>
        <Label htmlFor="role">What are you recruiting for?</Label>
        <Input
          id="role"
          placeholder="PM, SWE, startup roles..."
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="mt-1 h-11 rounded-lg"
        />
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <Button type="submit" disabled={loading} className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-[#075B59] transition-colors">
        {loading ? "Joining..." : "Join the waitlist"}
      </Button>
    </form>
  );
}

"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ArrowLeft } from "lucide-react"

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<"signin" | "signup">("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      router.push("/inbox")
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      })
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      router.push("/onboarding")
    }
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Grain overlay */}
      <div className="grain fixed inset-0 pointer-events-none" />

      {/* Back to home */}
      <div
        className="relative z-10 mx-auto max-w-6xl px-6 pt-6 page-enter"
        style={{ animationDelay: "0ms" }}
      >
        <Link
          href="/"
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
          Back
        </Link>
      </div>

      {/* Centered login */}
      <div className="relative z-10 flex min-h-[calc(100vh-120px)] items-center justify-center px-4">
        <div className="w-full max-w-md">
          {/* Branding */}
          <div
            className="text-center mb-10 page-enter"
            style={{ animationDelay: "60ms" }}
          >
            <div className="flex items-center justify-center gap-3 mb-3">
              <div className="status-dot" />
              <h1 className="text-3xl font-heading font-bold tracking-tight text-foreground">
                Koda
              </h1>
            </div>
            <p className="font-system text-primary">
              Opportunity agent
            </p>
          </div>

          {/* Card */}
          <div
            className="rounded-2xl border border-border bg-card shadow-sm p-8 page-enter"
            style={{ animationDelay: "120ms" }}
          >
            {/* Mode toggle */}
            <div className="flex items-center rounded-lg bg-secondary/60 p-1 mb-8">
              <button
                type="button"
                onClick={() => {
                  setMode("signin")
                  setError(null)
                }}
                className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-all ${
                  mode === "signin"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("signup")
                  setError(null)
                }}
                className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-all ${
                  mode === "signup"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sign up
              </button>
            </div>

            {/* Heading */}
            <div className="mb-6">
              <h2 className="text-xl font-heading font-semibold text-foreground">
                {mode === "signin" ? "Welcome back" : "Create an account"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {mode === "signin"
                  ? "Sign in with your email and password"
                  : "Enter your details to get started"}
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit}>
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium text-foreground">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="h-11 rounded-lg"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium text-foreground">
                    Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete={
                      mode === "signin" ? "current-password" : "new-password"
                    }
                    className="h-11 rounded-lg"
                  />
                </div>

                {error && (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
                  disabled={loading}
                >
                  {loading
                    ? mode === "signin"
                      ? "Signing in..."
                      : "Creating account..."
                    : mode === "signin"
                      ? "Sign In"
                      : "Sign Up"}
                </Button>
              </div>
            </form>
          </div>

          {/* Footer tagline */}
          <div
            className="mt-8 text-center page-enter"
            style={{ animationDelay: "180ms" }}
          >
            <p className="font-system text-muted-foreground">
              Built for students who recruit differently
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

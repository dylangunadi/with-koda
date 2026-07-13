"use client"

import { useEffect, useState } from "react"
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
  const [confirmationSent, setConfirmationSent] = useState(false)

  useEffect(() => {
    async function readAuthError() {
      const authError = new URLSearchParams(window.location.search).get("error")
      if (authError === "confirm") {
        setError(
          "That confirmation link is invalid or expired, or was opened in a different browser. Sign in, or sign up again for a fresh link."
        )
      }
    }
    readAuthError()
  }, [])

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
      // Check if user has a profile — if so, go to inbox; otherwise onboarding
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", user.id)
          .single()
        router.push(profile ? "/inbox" : "/talk")
      } else {
        router.push("/inbox")
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Confirmation links come back to this exact deployment (localhost,
          // preview, or production) instead of the auth server's default URL.
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      // If email confirmation is required, user won't have a session yet
      if (data.user && !data.session) {
        setError(null)
        setLoading(false)
        setConfirmationSent(true)
        return
      }
      router.push("/talk")
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

          {/* Email confirmation message */}
          {confirmationSent && (
            <div
              className="rounded-xl border border-primary/20 bg-accent p-8 text-center page-enter"
              style={{ animationDelay: "120ms" }}
            >
              <div className="flex justify-center mb-4">
                <div className="status-dot" />
              </div>
              <p className="text-lg font-heading font-semibold text-foreground">
                Check your email
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                We sent a confirmation link to <span className="font-medium text-foreground">{email}</span>.
                Click it and you will be signed in automatically.
              </p>
              <button
                type="button"
                onClick={() => {
                  setConfirmationSent(false)
                  setMode("signin")
                }}
                className="mt-4 text-sm font-medium text-primary hover:underline"
              >
                Back to sign in
              </button>
            </div>
          )}

          {/* Card */}
          {!confirmationSent && <div
            className="rounded-xl border border-border bg-card shadow-sm p-8 page-enter"
            style={{ animationDelay: "120ms" }}
          >
            {/* Heading */}
            <div className="mb-6">
              <h2 className="text-xl font-heading font-semibold text-foreground">
                {mode === "signin" ? "Welcome back" : "Create an account"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {mode === "signin"
                  ? "Sign in to see your recruiting brief."
                  : "Enter your details to get started."}
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
                  className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-[#075B59] transition-colors"
                  disabled={loading}
                >
                  {loading
                    ? mode === "signin"
                      ? "Signing in..."
                      : "Creating account..."
                    : mode === "signin"
                      ? "Sign In"
                      : "Create Account"}
                </Button>
              </div>
            </form>

            {/* Mode switch */}
            <div className="mt-6 text-center text-sm text-muted-foreground">
              {mode === "signin" ? (
                <>
                  New to Koda?{" "}
                  <button
                    type="button"
                    onClick={() => { setMode("signup"); setError(null) }}
                    className="font-medium text-primary hover:underline"
                  >
                    Create an account
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => { setMode("signin"); setError(null) }}
                    className="font-medium text-primary hover:underline"
                  >
                    Sign in
                  </button>
                </>
              )}
            </div>
          </div>}

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

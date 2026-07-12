"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

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
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div className="grain pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="pointer-events-none absolute -top-32 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-primary/8 blur-3xl dark:bg-primary/10" aria-hidden="true" />

      <div className="relative z-10 w-full max-w-md page-enter">
        <div className="mb-8 text-center stagger-1">
          <div className="mb-4 flex items-center justify-center gap-2 font-system text-primary">
            <span className="status-dot" />
            <span>// system online</span>
          </div>
          <h1 className="flex items-center justify-center gap-3 text-4xl font-heading font-semibold tracking-tight text-foreground">
            <span className="status-dot" /> Koda
          </h1>
          <p className="mt-2 text-muted-foreground text-sm">
            Your opportunity agent
          </p>
        </div>

        <Card className="briefing-accent relative overflow-hidden border-border/70 bg-card/90 shadow-xl shadow-primary/5 backdrop-blur-sm stagger-2 before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary">
          <CardHeader className="space-y-2 pl-8">
            <div className="font-system text-muted-foreground">
              // secure access
            </div>
            <CardTitle className="text-2xl tracking-tight">
              {mode === "signin" ? "Welcome back" : "Create an account"}
            </CardTitle>
            <CardDescription>
              {mode === "signin"
                ? "Sign in with your email and password"
                : "Enter your details to get started"}
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-5 pl-8">
              <div className="space-y-2">
                <Label htmlFor="email" className="font-system text-foreground">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="font-system text-foreground">Password</Label>
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
                />
              </div>

              {error && (
                <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
            </CardContent>

            <CardFooter className="flex flex-col gap-3 pl-8">
              <Button
                type="submit"
                className="w-full"
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

              <p className="text-sm text-muted-foreground text-center">
                {mode === "signin"
                  ? "Don\u2019t have an account?"
                  : "Already have an account?"}{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === "signin" ? "signup" : "signin")
                    setError(null)
                  }}
                  className="text-primary hover:underline font-medium"
                >
                  {mode === "signin" ? "Sign up" : "Sign in"}
                </button>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  )
}

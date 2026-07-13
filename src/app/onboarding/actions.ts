"use server"

import { createClient } from "@/lib/supabase/server"

interface ProfileFormData {
  name: string
  school: string
  year: string
  target_roles: string[]
  target_companies: string
  industries: string[]
  locations: string[]
  work_auth: string
  resume_text: string
  linkedin_url: string
  focus_options: string[]
  semester_goal: string
}

function splitCommas(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

export async function saveProfile(data: ProfileFormData) {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error("Not authenticated")
  }

  // Brief settings (autonomous_enabled, brief_frequency, brief_email) are
  // deliberately NOT written here: they are managed by /api/briefs so profile
  // edits can never silently change scheduled-brief consent or email state.
  const profile = {
    user_id: user.id,
    name: data.name || null,
    school: data.school || null,
    year: data.year || null,
    target_roles: data.target_roles,
    target_companies: splitCommas(data.target_companies),
    industries: data.industries,
    locations: data.locations,
    work_auth: data.work_auth || null,
    resume_text: data.resume_text || null,
    linkedin_url: data.linkedin_url || null,
    focus_options: data.focus_options,
    semester_goal: data.semester_goal || null,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from("profiles")
    .upsert(profile, { onConflict: "user_id" })

  if (error) {
    throw new Error(error.message)
  }

  return { success: true }
}

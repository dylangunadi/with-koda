"use server"

import { createClient } from "@/lib/supabase/server"

interface ProfileFormData {
  name: string
  school: string
  year: string
  target_roles: string
  target_companies: string
  industries: string
  locations: string
  work_auth: string
  resume_text: string
  linkedin_url: string
  semester_goal: string
  contacts_notes: string
  autonomous_enabled?: boolean
  brief_frequency?: string
  brief_email?: string
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

  const profile = {
    user_id: user.id,
    name: data.name || null,
    school: data.school || null,
    year: data.year || null,
    target_roles: splitCommas(data.target_roles),
    target_companies: splitCommas(data.target_companies),
    industries: splitCommas(data.industries),
    locations: splitCommas(data.locations),
    work_auth: data.work_auth || null,
    resume_text: data.resume_text || null,
    linkedin_url: data.linkedin_url || null,
    semester_goal: data.semester_goal || null,
    contacts_notes: data.contacts_notes || null,
    autonomous_enabled: data.autonomous_enabled ?? false,
    brief_frequency: ["daily", "weekly"].includes(data.brief_frequency || "") ? data.brief_frequency : "daily",
    brief_email: data.brief_email || null,
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

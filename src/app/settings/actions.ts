"use server";

import { createClient } from "@/lib/supabase/server";
import { profileColumns, type EditableProfile } from "@/lib/koda/profileFields";

/**
 * Save profile edits from Settings. Writes exactly the fields chat onboarding
 * writes. Brief settings (autonomous_enabled, brief_frequency, brief_email)
 * are deliberately NOT written here: they are managed by /api/briefs so
 * profile edits can never silently change scheduled-brief consent or email
 * state.
 */
export async function updateProfile(
  input: EditableProfile
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: "Not authenticated" };
  }

  const columns = profileColumns(input);
  if (!columns.name) {
    return { success: false, error: "Name is required" };
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ ...columns, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .select("id");
  if (error) {
    console.error("Profile update failed:", error);
    return { success: false, error: "Could not save your profile. Try again." };
  }
  if (!data?.length) {
    return { success: false, error: "Finish talking to Koda to create your profile first." };
  }
  return { success: true };
}

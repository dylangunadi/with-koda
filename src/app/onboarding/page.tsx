import { redirect } from "next/navigation";

// Onboarding is conversational now. This route stays so old links and the
// existing profile checks keep working, but the experience lives at /talk.
export default function OnboardingPage() {
  redirect("/talk");
}

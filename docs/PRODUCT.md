# Product — Koda

## Target User

Undergraduate students recruiting for competitive early-career roles in tech, startups, PM, AI, and adjacent fields.

## Core Problem

Students without inherited recruiting networks struggle to identify who to contact, what to send, and when to follow up. The recruiting process is opaque and momentum-dependent.

## Primary User Journey

1. **Landing page** — Learn what Koda does, join the waitlist or sign in
2. **Sign up / Sign in** — Email + password authentication
3. **Talk to Koda** (`/talk`) — A contained call: start the call and Koda listens automatically, detects when you finish speaking, streams its reply in text and speech, and can be interrupted mid-sentence. Mute, switch to text, or end the call at any time; the text composer is always available. Koda gathers nine topics: identity (name, school, year), target roles, target companies, recruiting stage, timing and deadlines, locations and work authorization, existing contacts, proof of work, and a one-sentence definition of success. The conversation resumes safely across refreshes and sessions; answered questions are never re-asked.
4. **Review and confirm** — An editable summary of everything Koda learned, plus a brief schedule choice (Manual only / Weekly / Daily). Confirming creates the profile and the first Koda Brief.
5. **Inbox** — The persistent Koda Brief: three grounded moves with action tabs (Today, Saved, Completed, Not relevant)
6. **Act on moves** — Mark completed (reporting how long it really took), Save for later, or Not relevant with an optional reason; edit outreach drafts. There is no Send action: Koda has no sending integration, so nothing may claim a message went out.
7. **Ongoing Talk to Koda** — After onboarding, `/talk` stays useful: tell Koda about conversations ("I spoke to Maya at Notion yesterday") to build confirmed relationship memory, change goals (Koda proposes an old-to-new diff you confirm), or ask "what should I do next?" for one concrete grounded recommendation.
8. **Run Koda** — Generate a fresh brief on demand from the inbox
9. **Settings** — Edit profile; manage scheduled briefs (in-app briefs need only in-product consent; the email digest additionally requires email confirmation)
10. **Scheduled briefs** — Cron generates a persisted brief per schedule (idempotent per day) and emails a digest only to confirmed addresses

## Current Functionality (from code)

- Email/password auth via Supabase Auth
- Conversational onboarding with structured extraction (`koda_conversations.extracted`), refresh-safe resume, and a review/confirm step
- Real conversational voice via the Web Speech API where supported: automatic listening with live interim transcript, pause-based turn taking, interruptible spoken replies, low-confidence transcripts offered for correction before sending, an honest mic-on indicator, and no raw audio ever stored; microphone denial leaves the text flow fully usable
- First Koda Brief: exactly three moves of distinct types, each labeled by source status (from what you told Koda / inferred / Koda's suggestion) with a broad effort bucket (Quick under 15 min / Focused 15-45 min / Project); predicted-versus-actual effort calibrates future sizing
- Briefs are first-class rows (`briefs`) with sources: onboarding, manual, scheduled
- 5 move types: opportunity, person_to_contact, follow_up, proof_of_work, application_strategy
- Move actions: one dominant CTA per card (Mark completed, collecting the actual effort bucket), with Save for later and Not relevant (optional reason) as secondaries and an editable outreach draft; nothing ever sends externally
- Relationship memory (`relationships`): captured through conversation, saved only after explicit confirmation, original message preserved verbatim, feeds future brief generation (the one place real names are allowed in prompts)
- Profile updates through conversation: whitelisted-field diffs applied only after confirmation
- Agent memory: accepted, completed, and rejected moves shape future generations; recent board titles are never repeated
- AI provider abstraction: live Anthropic (Claude Sonnet) or a deterministic offline provider when no API key is configured — offline mode is labeled in the UI and grounded only in user-provided data
- Rate limiting: 2-minute cooldown between generations; onboarding, confirm, and cron paths are idempotent (unique indexes plus duplicate-submission guards)
- Product instrumentation in `koda_events` (ids/enums/counts only, never user content); activation query documented in TODOS.md
- Waitlist signup (public endpoint)
- Scheduled brief cron (daily at 8 AM UTC, weekly on Mondays), idempotent per user per day
- Email digest via Resend (falls back to console logging), sent only to confirmed addresses
- Landing page with marketing copy and waitlist form

## Non-Goals

- Koda is not a job board or ATS
- Koda does not apply to jobs on behalf of users
- Koda does not send messages on behalf of users — there is no Send action anywhere, and the API rejects the legacy `sent` status
- Koda does not invent people, openings, or research; move sources are labeled
- No social auth (Google, GitHub, etc.) currently

## Product Uncertainties (need Dylan's confirmation)

- [ ] Is the waitlist table still in active use, or has it been superseded by direct sign-up?
- [ ] What is the intended relationship between `resume_text` and `experience_summary` in profiles?
- [x] Should autonomous briefs require email confirmation? Resolved: in-app scheduled briefs need in-product consent only; the email digest requires the double-opt-in.
- [ ] What is the target for move generation quality with the live model — the offline provider is a labeled fallback, not the bar?
- [ ] Is deeper move deduplication needed beyond prompt-level recent-title avoidance?
- [ ] What user count is the cron designed to handle (currently sequential per-user)?

# Product — Koda

## Target User

Undergraduate students recruiting for competitive early-career roles in tech, startups, PM, AI, and adjacent fields.

## Core Problem

Students without inherited recruiting networks struggle to identify who to contact, what to send, and when to follow up. The recruiting process is opaque and momentum-dependent.

## Primary User Journey

1. **Landing page** — Learn what Koda does, join the waitlist or sign in
2. **Sign up / Sign in** — Email + password authentication
3. **Talk to Koda** (`/talk`) — A contained chat: the page never grows, the transcript scrolls internally and follows the conversation, and Koda's replies stream in live. Koda gathers nine topics: identity (name, school, year), target roles, target companies, recruiting stage, timing and deadlines, locations and work authorization, existing contacts, proof of work, and a one-sentence definition of success. The conversation resumes safely across refreshes and sessions; answered questions are never re-asked. (A voice-call version of onboarding is parked on the `feat/voice-call-onboarding` branch.)
4. **Review and confirm** — An editable summary of everything Koda learned pops up over the chat, plus a brief schedule choice (Manual only / Weekly / Daily). Confirming creates the profile and the first Koda Brief.
5. **Inbox** — The persistent Koda Brief: three grounded moves with action tabs (Today, Saved, Completed, Not relevant)
6. **Act on moves** — Mark completed (reporting how long it really took), Save for later, or Not relevant with an optional reason; edit outreach drafts. Thread-grounded Gmail moves additionally offer Create Gmail draft and Send via Gmail: Koda sends only when you press Send on a specific message. Sending is deterministic and per-message (it sends exactly the text you approved, once) and Koda never sends on its own.
7. **Ongoing Talk to Koda** — After onboarding, `/talk` stays useful: tell Koda about conversations ("I spoke to Maya at Notion yesterday") to build confirmed relationship memory, change goals (Koda proposes an old-to-new diff you confirm), or ask "what should I do next?" for one concrete grounded recommendation.
8. **Run Koda** — Generate a fresh brief on demand from the inbox
9. **Settings** — Edit profile; manage scheduled briefs (in-app briefs need only in-product consent; the email digest additionally requires email confirmation)
10. **Scheduled briefs** — Cron generates a persisted brief per schedule (idempotent per day) and emails a digest only to confirmed addresses

## Current Functionality (from code)

- Email/password auth via Supabase Auth
- Conversational onboarding with structured extraction (`koda_conversations.extracted`), refresh-safe resume, and a review/confirm step
- Streamed chat turns: optimistic user messages, instant composer clear with restore-on-failure, live streaming replies (voice calls are parked on `feat/voice-call-onboarding`)
- First Koda Brief: exactly three moves of distinct types, each labeled by source status (from what you told Koda / inferred / Koda's suggestion) with a broad effort bucket (Quick under 15 min / Focused 15-45 min / Project); predicted-versus-actual effort calibrates future sizing
- Briefs are first-class rows (`briefs`) with sources: onboarding, manual, scheduled
- 5 move types: opportunity, person_to_contact, follow_up, proof_of_work, application_strategy
- Move actions: one dominant CTA per card (Mark completed, collecting the actual effort bucket), with Save for later and Not relevant (optional reason) as secondaries and an editable outreach draft; outbound action exists only as the explicit per-message Gmail draft/send buttons
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
- Integrations (optional, recommended after the first brief, never during onboarding): Google Calendar read-only import, Gmail recruiting-thread import (query-scoped; subjects, senders, and previews only — never bodies or the full mailbox), and public Greenhouse/Lever job boards
- Gmail reply loop: threads awaiting the user's reply become follow-up moves with editable reply drafts. "Create Gmail draft" places the draft in the user's Drafts folder; "Send via Gmail" shows a confirm dialog with the exact recipient, subject, and text (fetched from the server, not guessed by the client) and sends it once on confirm. Both happen only on that click; the send path is deterministic with no model involved, and a claim-first guard makes double-sends impossible
- Verified moves: a move built on an imported calendar event or a live job posting is labeled "Verified source" with a link to the real source and an honest checked-ago timestamp; the label is enforced server-side and cannot be produced by the model alone
- Integration trust rules: read access plus exactly two explicit-click Gmail writes (draft, send); Koda never sends on its own, never creates or edits calendar events, and never acts autonomously; disconnecting deletes everything Koda imported (moves already on the board keep their copied source link as personal history)
- Integration management in Settings: connection status, plain-language scope disclosure, Sync now, disconnect-with-deletion; job boards suggested from the user's own target companies with a paste-a-URL fallback (honest framing: public Greenhouse/Lever boards only)

## Non-Goals

- Koda is not a job board or ATS
- Koda does not apply to jobs on behalf of users
- Koda never sends autonomously. The only send is the explicit per-message button (deterministic, no LLM in the path, confirmed against the server's own preview); the API still rejects any client-set `sent` status, so nothing can merely claim a message went out
- Koda does not invent people, openings, or research; move sources are labeled, and "verified" is unforgeable (server-side ref resolution)
- Koda never scans a mailbox, never scrapes LinkedIn, and never automates LinkedIn actions (assisted outreach is copy-paste only; see docs/LINKEDIN_AUTOMATION.md for the researched decision)
- No social auth (Google, GitHub, etc.) currently — Google OAuth exists only as the Calendar data integration

## Product Uncertainties (need Dylan's confirmation)

- [ ] Is the waitlist table still in active use, or has it been superseded by direct sign-up?
- [ ] What is the intended relationship between `resume_text` and `experience_summary` in profiles?
- [x] Should autonomous briefs require email confirmation? Resolved: in-app scheduled briefs need in-product consent only; the email digest requires the double-opt-in.
- [ ] What is the target for move generation quality with the live model — the offline provider is a labeled fallback, not the bar?
- [ ] Is deeper move deduplication needed beyond prompt-level recent-title avoidance?
- [ ] What user count is the cron designed to handle (currently sequential per-user)?

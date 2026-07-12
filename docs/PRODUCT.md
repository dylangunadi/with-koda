# Product — Koda

## Target User

Undergraduate students recruiting for competitive early-career roles in tech, startups, PM, AI, and adjacent fields.

## Core Problem

Students without inherited recruiting networks struggle to identify who to contact, what to send, and when to follow up. The recruiting process is opaque and momentum-dependent.

## Primary User Journey

1. **Landing page** — Learn what Koda does, join the waitlist or sign in
2. **Sign up / Sign in** — Email + password authentication
3. **Onboarding** — 4-step profile wizard:
   - About you (name, school, year)
   - What you want (roles, industries, company size, locations, target companies)
   - Your experience (LinkedIn, resume text, work auth)
   - Focus (goals, free-form context)
4. **Inbox** — View AI-generated recruiting "moves" in tabs (Today, Saved, Sent, Rejected)
5. **Run Koda** — Generate 3 new personalized moves via Claude
6. **Act on moves** — Accept, reject, save, or mark as sent; edit outreach drafts
7. **Settings** — Update profile, enable autonomous daily/weekly briefs via email
8. **Autonomous briefs** — Cron generates moves and emails digest to opted-in users

## Current Functionality (from code)

- Email/password auth via Supabase Auth
- Profile creation and editing
- AI move generation (3 moves per run) via Claude Sonnet with mock fallback
- 5 move types: opportunity, person_to_contact, follow_up, proof_of_work, application_strategy
- Move actions: accept, reject, save, mark sent, edit outreach draft
- Agent memory: feedback patterns influence future move generation
- Rate limiting: 2-minute cooldown between generations
- Waitlist signup (public endpoint)
- Autonomous brief cron (daily at 8 AM UTC, weekly on Mondays)
- Email digest via Resend (falls back to console logging)
- Landing page with marketing copy and waitlist form

## Non-Goals

- Koda is not a job board or ATS
- Koda does not apply to jobs on behalf of users
- Koda does not send messages on behalf of users (user approves every send)
- No social auth (Google, GitHub, etc.) currently

## Product Uncertainties (need Dylan's confirmation)

- [ ] Is the waitlist table still in active use, or has it been superseded by direct sign-up?
- [ ] What is the intended relationship between `resume_text` and `experience_summary` in profiles? Both are populated from the same onboarding field.
- [ ] Should autonomous briefs require email confirmation before enabling?
- [ ] What is the target for move generation quality — are mock moves acceptable for MVP launch?
- [ ] Is there a plan for move deduplication across generations?
- [ ] What user count is the cron designed to handle (currently sequential per-user)?

# Design — Koda

## Current UI Conventions

### Color Palette
- **Primary**: Teal `#087C78` (light), `#0d9488` (dark)
- **Background**: Warm off-white `#F7F5EF` (light), `#0a0a0f` (dark)
- **Cards**: `#F2F0EA` (light), `#111118` (dark)
- **Border**: `#DADDD8` (light), `#1f2937` (dark)
- **Muted text**: `#62666F`
- **Accent**: `#E8F4F1` (teal-tinted light background)

### Typography
- **Body**: Geist Sans, 15px base
- **Headings**: Newsreader (serif), `font-heading` class
- **System labels**: Geist Mono, 11px, uppercase, 0.06em letter-spacing, `font-system` class
- **Move type labels**: 11px, uppercase, semibold, wide tracking, color-by-type text only

### Move Cards
- Neutral cards and borders; category color appears only as a small uppercase text label (teal/blue/amber/purple/emerald by type)
- Collapsed: type label + effort bucket (mono, top corners), serif title, one why-now paragraph, one dominant CTA (Mark completed, primary teal) with quiet Save for later / Not relevant secondaries
- Expanded: first step, editable draft, proof-of-work angle, timing, and a single mono provenance line (source status · source note · confidence)
- Completing collects the actual effort bucket inline (Quick / Focused / Project / Skip); Not relevant offers an optional reason

### Layout
- Max width: `max-w-6xl` (landing), `max-w-4xl` (app shell)
- Padding: `px-6`
- Card padding: `p-5` to `p-8`
- Section spacing: `py-16 sm:py-20`

### Components
- **Buttons**: `h-11 rounded-lg`, primary uses `bg-primary hover:bg-[#075B59]`
- **Inputs**: `h-11 rounded-lg`
- **Cards**: `rounded-xl border border-border bg-card shadow-sm`
- **Badges**: `rounded-md px-2 py-0.5`
- **Grain overlay**: SVG noise texture with CSS animation

### Talk to Koda Chat Surface
- Fixed viewport (`h-dvh`, `src/components/talk/TalkToKoda.tsx`): the transcript is the only scrolling region and auto-follows new messages; the header and composer are anchored, with `env(safe-area-inset-bottom)` padding on mobile — the page itself never grows or scrolls
- Koda messages carry the Koda logo mark (`src/components/KodaLogo.tsx`: teal circle, monoline K with a dot for its upper arm) beside a mono "Koda" label, with a pulsing caret while streaming; user messages are right-aligned accent bubbles
- The header shows the logo + wordmark; there is no visible progress counter during onboarding (a hidden `data-onboarding-remaining` attribute keeps tests deterministic) — the conversation should feel natural, not like a form
- Completed Koda replies are announced once through a visually hidden `aria-live="polite"` region; the transcript itself is not a live region (streaming deltas would be re-announced word by word)
- The composer is pinned at the bottom in every state; the "Offline sample mode" chip (mono, muted) appears whenever the deterministic provider is active — never hide it
- The end-of-onboarding review pops up as a modal over the dimmed chat (never buried at the bottom of the transcript)
- Confirmation cards (relationship memory, profile diffs) are standard cards with a mono question label ("Save to memory?" / "Update your profile?"), Confirm + "Not now" buttons, and old values struck through in diffs
- Voice calls (orb, mic, TTS) live on the `feat/voice-call-onboarding` branch, not here

## Required States

### Loading States
- Use the `status-dot` (pulsing teal dot) for page-level loading
- Use `Loader2` spinner (lucide) for button loading states
- Show loading text: "Loading...", "Saving...", "Running Koda..."
- Disable interactive elements during loading

### Empty States
- Dashed border container with centered content
- Icon in accent circle, heading, and descriptive text
- Guide users toward the next action
- See `InboxTabs.tsx` `EmptyState` component as reference

### Error States
- Inline error: `rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive`
- Toast errors: `toast.error()` for transient failures
- Distinguish user errors (form validation) from system errors (API failures)

### Responsiveness
- Mobile-first approach
- Breakpoints: `sm:` (640px), `lg:` (1024px)
- Stack to grid: `grid sm:grid-cols-2 lg:grid-cols-3`
- Hide decorative elements on small screens: `hidden lg:flex`

### Accessibility
- Form inputs have associated `<Label>` elements
- Buttons have descriptive text or `aria-label`
- Focus rings: `box-shadow: 0 0 0 2px var(--background), 0 0 0 4px var(--primary)`
- `aria-checked` on toggle switches
- Decorative icons use `aria-hidden="true"`

### User-Facing Copy
- Concise, direct, lowercase-preferred
- First person for actions: "Save draft", "Run Koda"
- Second person for descriptions: "Your moves", "Your profile"
- No jargon or corporate language
- No em dashes in user-facing copy
- Banned phrases (from prompts): "circling back", "touching base", "bandwidth", "leverage"
- Never imply an external action happened that did not: "Sent via Gmail" appears only when the server recorded a real send (gmail_sent_at + message id); nothing else may claim Send/Sent
- Label AI provenance honestly: move cards show a mono source line ("From what you told Koda" / "Inferred from your profile" / "Koda's suggestion") with confidence and effort

### Destructive Actions
- "Not relevant" (move rejection) uses red styling (`text-red-500`)
- Conversation proposals never write without explicit confirmation (Confirm / "Not now")
- Sign out is text-only, no confirmation dialog (low risk — re-sign-in is easy)
- No delete actions currently exist in the UI
- Future destructive actions should require confirmation dialog

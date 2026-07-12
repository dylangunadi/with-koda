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
- **Move type badges**: 10px, uppercase, semibold, wide tracking

### Move Type Colors
| Type | Light |
|------|-------|
| Opportunity | teal-100/teal-800 |
| Person to contact | blue-100/blue-800 |
| Follow up | amber-100/amber-800 |
| Proof of work | purple-100/purple-800 |
| Application strategy | emerald-100/emerald-800 |

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
- Banned phrases (from prompts): "circling back", "touching base", "bandwidth", "leverage"

### Destructive Actions
- Reject moves use red styling (`text-red-500`)
- Sign out is text-only, no confirmation dialog (low risk — re-sign-in is easy)
- No delete actions currently exist in the UI
- Future destructive actions should require confirmation dialog

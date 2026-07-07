---
name: Hush
description: The anti–social-media app — quiet zones, rewarded silence, the Ink Garden.
colors:
  # Light mode foundation (paper world)
  paper: "#F5F1EA"
  surface: "#FBF8F2"
  ink: "#22201D"
  charcoal: "#4A463F"
  border: "#E4DDD1"
  muted: "#8A8478"
  # Dark mode (the night world — in-zone / active session)
  night: "#16140F"
  night-card: "#23201A"
  night-text: "#F2ECE0"
  night-muted: "#8A7E6C"
  night-border: "#34301F"
  night-hint: "#C9C0AE"
  night-label: "#8A7A54"
  # Operator dashboard surface (slightly cooler dark)
  dashboard-bg: "#0E1116"
  dashboard-text: "#F4F6F8"
  # Quiet Index glow scale — the ONE place color carries meaning
  glow-high: "#E8C170"
  glow-high-core: "#E0B86A"
  glow-high-halo: "#E8C17040"
  glow-mid: "#D9A85E"
  glow-low: "#8A98A6"
  glow-none: "#3A3A3A"
  # Accent & semantic
  accent: "#6B7F6E"
  alert: "#B07A5E"
  reward: "#C9A24B"
typography:
  display:
    fontFamily: "Newsreader, Georgia, serif"
    fontWeight: 300
    lineHeight: 1.0
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Newsreader, Georgia, serif"
    fontWeight: 300
    fontSize: "2rem"
    lineHeight: 1.15
  body:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontWeight: 400
    fontSize: "1rem"
    lineHeight: 1.6
  label:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontWeight: 600
    fontSize: "0.625rem"
    letterSpacing: "0.15em"
rounded:
  sm: "12px"
  md: "16px"
  lg: "24px"
  full: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.glow-high}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "15px 32px"
    typography: "{typography.label}"
  orb-core:
    backgroundColor: "{colors.glow-high-core}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    size: "140px"
  coach-card:
    backgroundColor: "{colors.night-card}"
    textColor: "{colors.night-text}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  tile:
    backgroundColor: "{colors.night-card}"
    textColor: "{colors.night-text}"
    rounded: "{rounded.md}"
    padding: "14px"
  zone-bloom:
    backgroundColor: "{colors.glow-high}"
    rounded: "{rounded.full}"
    size: "28px"
---

# Design System: Hush

## 1. Overview

**Creative North Star: "The Ink Garden"**

This is a system built from emptiness. Negative space is not an absence — it is the material. Every screen is a garden of *ma* (間): the fertile pause between ink marks on rice paper. Where most apps demand attention, Hush returns it. The visual language is rooted in Japanese paper-craft and the still quality of a well-tended library: warm, weighty, unhurried. Nothing competes for the eye. One thing glows.

The Quiet Index orb is the single exception to the emptiness rule — the one point where color does work. Every other surface is tonal, muted, and composed. The glow earns its visibility precisely because the rest of the screen refuses to compete with it. This is restraint as philosophy, not aesthetic default.

The system explicitly rejects: the dopamine machine (red badges, count dots, confetti, anxious spinners), generic meditation-app minimalism (cream body, blob illustrations, kicker eyebrows on every section), cold SaaS precision (white-and-blue, dashboard grids, busy data walls), and the gamified notification loop. If a screen could belong to a social media app, it is wrong for Hush.

**Key Characteristics:**
- One focal point per screen; all other elements support it or disappear
- Two worlds — the paper world (light mode, operator dashboard) and the night world (in-zone mobile) — unified by warmth and type
- Negative space is load-bearing; margins breathe, nothing crowds
- Motion is botanical: slow, organic, respectful of stillness
- Color means exactly one thing: how quiet the zone is right now

## 2. Colors: The Ink Garden Palette

Two worlds, one warmth. Light mode is washi paper. Dark mode is the inside of a lantern. The glow is the flame.

### Primary

The Quiet Index glow scale is the system's only true primary color. It is a temperature ramp used exclusively to communicate the live Quiet Index (0–100). It appears on orbs, map blooms, loading states, and reward confirmations — nowhere else.

- **Warm Amber Glow** (`#E8C170`): High quiet (71–100). Full saturation. The moment the zone is truly quiet.
- **Warm Amber Core** (`#E0B86A`): Interior of the orb at high quiet. Slightly deeper, slightly more golden.
- **Amber Halo** (`#E8C17040`): The breathing radial bloom behind the orb. 25% opacity; never a hard ring.
- **Muted Amber** (`#D9A85E`): Mid quiet (31–70). Less gold, more brown — the zone is warming toward silence.
- **Cool Grey-Blue** (`#8A98A6`): Low quiet (0–30). Desaturated, cooler, almost absent — the zone is noisy.
- **Baseline Grey** (`#3A3A3A`): No reading yet. Not the same as "noisy." Used for zones where quorum has never been met.

**The One Signal Rule.** The glow colors (`glow-high`, `glow-mid`, `glow-low`) appear in exactly one role: communicating the Quiet Index. Do not use `#E8C170` as a button color, brand accent, or highlight unless it is communicating silence level.

### Secondary

- **Sage** (`#6B7F6E`): A single UI accent. Used for interactive elements that need differentiation without urgency — selected states, map zone boundaries, secondary CTAs. Muted, grounded, plant-like.

### Neutral

*Light mode (paper world):*
- **Warm Paper** (`#F5F1EA`): Primary background. The rice paper itself — warm enough to feel handmade, not so warm it reads as cream-AI-default.
- **Soft Surface** (`#FBF8F2`): Card surface above the paper ground. A thin step lighter; depth through tonal proximity, not shadow.
- **Warm Ink** (`#22201D`): Primary text and UI marks. Near-black with brown warmth — ink, not silicon.
- **Charcoal** (`#4A463F`): Secondary text, labels, metadata.
- **Hairline** (`#E4DDD1`): Borders, dividers. Barely visible; structural, not decorative.
- **Muted Warm** (`#8A8478`): Placeholder text, helper captions, tertiary information.

*Night world (in-zone mobile):*
- **Deep Night** (`#16140F`): The screen you see while disconnected. Deep warm black — a room with the lights off, not a computer terminal.
- **Night Card** (`#23201A`): Raised surfaces in the night world. Tile backgrounds, coach card, floating controls.
- **Night Warm Text** (`#F2ECE0`): Primary reading text on dark backgrounds.
- **Night Muted** (`#8A7E6C`): Secondary text in the night world. Warm, never cool-grey.
- **Night Hint** (`#C9C0AE`): Captions, helper text, the hint line below the orb.
- **Night Border** (`#34301F`): Subtle borders in the night world.
- **Night Label** (`#8A7A54`): All-caps labels (e.g. "YOUR SILENCE"). Warm amber-brown.

*Operator dashboard:*
- **Dashboard Night** (`#0E1116`): Page background for the operator console. Slightly cooler than the mobile night; the dashboard has less warmth, more clarity — an operator needs to read data, not meditate.
- **Dashboard Mist** (`#F4F6F8`): Primary text on the dashboard dark background. Near-white, slightly cool.

*Semantic:*
- **Dusty Clay** (`#B07A5E`): Gentle alert, error state. Never bright red. The color of unvarnished terracotta — attention without alarm.
- **Muted Gold** (`#C9A24B`): Reward confirmation, success states. Quiet celebration, not a fanfare.

### Named Rules

**The Two Worlds Rule.** Every screen belongs to one of two worlds: Paper (light, operator, administrative) or Night (dark, in-zone, meditative). Do not mix worlds on the same screen. The crossover is the color of the glow — it reads in both.

**The Anti-Cream Rule.** The paper background (`#F5F1EA`) is warm but not a placeholder. If a surface starts feeling like "AI-generated parchment," deepen it toward `ink` or desaturate toward true neutral. Warmth is carried by hue, not by nudging everything toward yellow.

## 3. Typography

**Display / Hero Font:** Newsreader 300 Light (with Georgia, serif fallback)
**Body / UI Font:** Hanken Grotesk 400 Regular and 600 SemiBold (with system-ui, sans-serif fallback)

**Character:** A classical pairing on a contrast axis — soft serif weight for the numbers that matter, humanist sans for everything that serves them. The Newsreader Light has the still quality of a letterpress; it conveys that the Quiet Index number is worth slowing down for. Hanken Grotesk is warm and readable without being warm in a twee way.

### Hierarchy

- **Display** (Newsreader 300, ~54px on mobile / fluid clamp max 96px on web, line-height 1.0): The Quiet Index score digit — the most important number on any screen. Give it air. Never dress it up with surrounding decoration; it is the focal point.
- **Headline** (Newsreader 300, ~2rem / 32px, line-height 1.15): Section headings where the reading moment matters — session summary, onboarding cards. Use rarely.
- **Title** (Hanken Grotesk 600, ~1.125rem / 18px, line-height 1.3): Zone names, screen titles, navigation landmarks. Readable and present, but never competing with Display.
- **Body** (Hanken Grotesk 400, 1rem / 16px mobile 14px, line-height 1.6): Coach card messages, zone descriptions, dashboard prose. Max line length: 65ch. Use `text-wrap: balance` on short prose blocks.
- **Label** (Hanken Grotesk 600, 0.5–0.625rem / 8–10px, letter-spacing 0.15–0.2em, uppercase): Stat labels below tiles ("YOUR SILENCE", "REMAINING"), form field labels, section markers in the dashboard. Use sparingly; the tracking earns its place only when the text is 2–4 words max.

### Named Rules

**The One Number Rule.** Each screen has at most one Display-size number. The Quiet Index score, the session timer, the points earned — whichever is the focal point of the current moment gets Display. Everything else steps down to Title or Label.

**The Uppercase Floor Rule.** All-caps labels must be at least 0.625rem with 0.15em letter-spacing. Smaller uppercase is illegible; more than 4 words in uppercase is hostile. If a label needs more words, it is a Body text string, not a Label.

## 4. Elevation

This system is flat by philosophy. Surfaces are distinguished by tonal proximity, not shadow depth. In the paper world, the page (`paper`) sits below the card (`surface`) — the step is so small it is barely visible, which is the intent. In the night world, `night` sits below `night-card`; again, a single tonal step up, no shadow.

The Quiet Index orb is the system's only "floating" element, and it floats through glow, not shadow. Its halo is a radial gradient at low opacity — breathing, diffuse, never a hard ring.

The operator dashboard uses no elevation at all. Tables and lists are flat; sections are separated by whitespace and borders, not by lifted cards or drop shadows.

### Named Rules

**The No-Shadow Rule.** Drop shadows (`box-shadow` other than the orb glow) are prohibited. If a UI element needs to feel "above" its context, use tonal background distinction or a hairline border. The glow is the only permitted exception — and it exists only on the Quiet Index orb.

**The Flat Dashboard Rule.** The operator console is a reading surface. No card grids, no glassmorphism, no hero-metric templates. Tables, lists, a line chart, and generous whitespace. Data should be clear; it should not try to look cool.

## 5. Components

### Quiet Index Orb (Signature Component)

The system's defining element. Three sizes:

- **Large / hero** (208px container, 140px core): In-zone active session. The breathing version. The halo animates on a ~4s ease-in-out loop; reduced motion renders it static at full opacity. The score in Newsreader 300 at 54px. The label "YOUR SILENCE" in Hanken SemiBold at 8px, 2em tracking, uppercase.
- **Medium** (96px container, 64px core): Zone detail screen, pre-check-in. Breathing optional depending on session state.
- **Small / bloom** (28px circle, 0.85 opacity): Map marker. Color only — no label. A dot of color representing how quiet the zone is. `glow-none` (#3A3A3A) when no reading exists; never a fallback to `glow-low`, since "no reading" and "noisy" are meaningfully different.

The halo is `rgba(232, 193, 112, 0.25)` — never more opaque, never a hard border. The breathing animation uses `Animated.loop` with a 2s ease-in-out sequence (scale 1.0 → 1.14 → 1.0). Reduced motion: static at scale 1.0.

### Buttons

The system has one primary button shape. There is no secondary/ghost variant in the current system — the single primary action per screen rule makes multiple button variants unnecessary.

- **Shape:** Gently rounded (16px / `{rounded.md}`).
- **Primary:** `glow-high` (`#E8C170`) background, `ink` (`#22201D`) text, Hanken SemiBold label at 0.75rem, 0px letter-spacing. Padding: 15px vertical, 32px horizontal.
- **State:** No hover effects on mobile (native Pressable). On web/dashboard, a slight `opacity: 0.9` on hover; no scale bounce, no color shift.
- **Disabled:** `opacity: 0.4`; never a different color.

**The One Action Rule.** Each screen presents one primary action. Do not include a secondary button below the primary button. If a destructive or secondary path is needed, use a text link or navigation affordance, not a second styled button.

### Coach Card (Anti-Notification)

The opposite of a notification. A soft, dismissible message that appears during active sessions.

- **Shape:** 16px radius (`{rounded.md}`), full width up to 280px max.
- **Background:** `night-card` (`#23201A`). No border. No shadow.
- **Text:** Hanken Regular 13px, line-height 18px, `night-text` (`#F2ECE0`). Right-padded 12px for dismiss glyph.
- **Dismiss:** A bare `×` glyph in Hanken Regular at 16px, `night-hint` color, no background, 22px minimum touch target.
- **Entrance:** 900ms ease-in-out fade from opacity 0. Reduced motion: instant appearance at opacity 1.
- **Never:** Red background, count badge, vibration, loud typography, auto-dismiss with a timer bar.

### Tiles (Info Cards)

Side-by-side data pairs in the active session screen.

- **Shape:** 16px radius, flex 1 per tile, max combined width 280px, gap 12px.
- **Background:** `night-card` (`#23201A`). Padding: 14px.
- **Value text:** Newsreader 300 at 26px, `night-warm-text`. Accent values (live score) use `glow-high`.
- **Label text:** Hanken SemiBold at 9px, 1.5em tracking, uppercase, `night-muted`.

### Zone Bloom (Map Marker)

- **Size:** 28px diameter circle, `border-radius: 14px`.
- **Color:** Mapped from Quiet Index via `quietIndexGlowColor()`. The color is the entire affordance; no border, no label.
- **Opacity:** 0.85 at rest.
- **No reading state:** `#3A3A3A` — a dim, neutral baseline that visually reads as "not yet measured," distinct from low-quiet grey-blue.

### Dashboard Zone List

Early-stage; minimal. Zone names as text links (`text-decoration: underline`). Layout: vertical list, gap 8px. Future phases will add inline Quiet Index badges and live sparklines. Avoid adding complexity before the data model justifies it.

### Inputs / Fields

Dashboard only (current state). No custom styling yet beyond Tailwind defaults. When styled:

- **Shape:** 12px radius (`{rounded.sm}`).
- **Style:** Hairline border (`border: "#E4DDD1"`), white/mist background, ink text.
- **Focus:** Hairline border shifts to `accent` sage. No glow effect (glow is reserved for the Quiet Index orb).
- **Error:** Dusty clay (`#B07A5E`) border, no red.

## 6. Do's and Don'ts

### Do

- **Do** put one focal point per screen — one number, one action, one question. Remove everything that doesn't serve it.
- **Do** use negative space as material. Margins of 24px minimum on mobile; breathe more on the dashboard. An empty area is not a layout mistake.
- **Do** make reduced-motion a first-class state. Every looping animation — the orb breath, fade-ins, transitions — must have a static or crossfade alternative that triggers when `prefers-reduced-motion: reduce` is set.
- **Do** communicate the Quiet Index with color and always a numeric value alongside it. Color alone is not accessible; the number confirms what the glow suggests.
- **Do** use the night world (`#16140F` background) for in-zone / active session screens — the one moment where Hush asks the user to go dark. Keep the rest of the mobile app in the paper world unless the content is session-adjacent.
- **Do** keep labels short enough for uppercase treatment (2–4 words max). If a label needs more words, it should be set in regular sentence-case Body, not Label.
- **Do** use `glow-none` (`#3A3A3A`) for zones with no Quiet Index reading, not `glow-low`. The distinction between "noisy" and "unmeasured" is meaningful.

### Don't

- **Don't** use red, orange, or any saturated color outside the Quiet Index glow scale. Alerts use dusty clay (`#B07A5E`). Rewards use muted gold (`#C9A24B`). Never RGB red.
- **Don't** use `#E8C170` (glow-high) for anything other than communicating a high Quiet Index. It is a semantic color, not a brand color. Its meaning is silence; diluting it destroys the signal.
- **Don't** animate using bounce or elastic easing. All easing is ease-in-out, exponential slow. The orb breathes; it does not bounce.
- **Don't** add a badge count, red dot, or notification indicator to any UI element. This is the anti–social-media app.
- **Don't** show a leaderboard, comparative score, or other-user ranking. Silence scores are private and non-comparative. Streaks are shown gently, never as a competitive metric.
- **Don't** use confetti, particle effects, popups, or dramatic transitions on reward or session-complete moments. A soft bloom (the orb at full glow) is the maximum celebration.
- **Don't** build card grids. Equal-sized cards with icon + heading + text, endlessly repeated, are the identity of apps that use attention as a resource. Use lists, large-type summaries, or blank space instead.
- **Don't** use gradient text (`background-clip: text` + gradient). It is decorative noise.
- **Don't** use drop shadows anywhere except the Quiet Index orb glow. Tonal layering handles depth.
- **Don't** default to the warm-neutral body background out of habit. The paper world (`#F5F1EA`) is warm because it means something — analog warmth, not AI-default parchment. If a surface is warm, its warmth must have a reason.
- **Don't** add eyebrow labels ("ABOUT" "PRICING" "PROCESS") above every section. One named Label per screen, where it earns its place by identifying a data field, not scaffolding a section hierarchy.
- **Don't** build a "war room" operator dashboard. The operator console is a reading surface: one Quiet Index number, a trend line, a digest. Operators should feel calm when they open it.

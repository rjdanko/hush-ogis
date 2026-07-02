# Hush Mobile App — Design Spec

**Date:** 2026-07-02
**Scope:** All 10 user-facing mobile screens (6 existing + 4 new)
**Approach:** Component-first. Components are defined once in §2; screens in §3 reference them by name rather than re-specifying them.
**Target:** Reference document for the impeccable skill to redesign/upgrade `apps/mobile/`.

---

## 1. Design System Foundation

### 1.1 Color Modes

Two modes. **Light** is the default — used on every screen except ActiveSession. **Dark** is reserved exclusively for the in-zone ActiveSession screen, reinforcing that it is a different, sacred state. The transition between modes is slow and ceremonial (see §4).

#### Light Mode Tokens
| Token | Hex | Usage |
|---|---|---|
| `background` | `#F5F1EA` | Screen background (warm paper) |
| `surface` | `#FBF8F2` | Cards, bottom sheets, tab bar |
| `ink` | `#22201D` | Primary text, icon fills |
| `inkSecondary` | `#4A463F` | Secondary text |
| `border` | `#E4DDD1` | Hairlines, dividers, input borders |
| `muted` | `#8A8478` | Placeholder text, captions |
| `accent` | `#6B7F6E` | Sage — check-in CTA, tab active state |
| `alert` | `#B07A5E` | Dusty clay — errors, delete action |
| `rewardGold` | `#C9A24B` | Wallet balance display |

#### Dark Mode Tokens (ActiveSession only)
| Token | Hex | Usage |
|---|---|---|
| `night` | `#16140F` | Screen background |
| `nightCard` | `#23201A` | Raised surfaces, stat tiles |
| `nightWarmText` | `#F2ECE0` | Primary text |
| `nightMuted` | `#A9A296` | Secondary text, hints |
| `nightBorder` | `#34301F` | Hairlines |
| `nightLabel` | `#8A7A54` | Section labels (muted gold) |

#### Quiet Index Glow Scale (shared, the only place color carries meaning)
| QI Range | Color | Name |
|---|---|---|
| 0–30 | `#8A98A6` | Cold grey-blue |
| 31–70 | `#D9A85E` | Warm amber |
| 71–100 | `#E8C170` | Full warm gold |

Glow is always a soft radial bloom at low opacity — never a hard ring. The halo layer uses 25% opacity of the base color. Zones with no QI reading use `#3A3A3A` at 50% opacity — explicitly "unknown," not "noisy."

---

### 1.2 Typography

Two families, already loaded in `App.tsx`.

| Role | Family | Weight | Size | Notes |
|---|---|---|---|---|
| `hero` | Newsreader | 300 Light | 56–72px | In-zone orb score |
| `heroLarge` | Newsreader | 300 Light | 48px | Wallet balance, zone QI in detail |
| `heroMedium` | Newsreader | 300 Light | 32px | Zone detail orb number |
| `heroSmall` | Newsreader | 300 Light | 28px | Stat chips |
| `heading` | HankenGrotesk | 600 SemiBold | 22px | Screen/section headings |
| `body` | HankenGrotesk | 400 Regular | 15px | Body copy, descriptions |
| `bodySmall` | HankenGrotesk | 400 Regular | 13px | Supporting text |
| `label` | HankenGrotesk | 600 SemiBold | 10px | Uppercase, letter-spacing 2 |
| `caption` | HankenGrotesk | 400 Regular | 12px | Metadata, point costs |

Line height: 1.5 for body, 1.1 for hero numerals. No tight leading anywhere.

---

### 1.3 Spacing & Shape

- **Base unit:** 8px — all spacing in multiples of 8
- **Screen-edge padding:** 24px
- **Card border-radius:** 20px
- **Button border-radius:** 16px
- **Input border-radius:** 12px
- **Tab bar height:** 56px + safe area inset
- **No hard drop shadows** — use surface color lift instead (cards read against paper background without shadow)

---

## 2. Core Components

### 2.1 Quiet Index Orb

The signature component. Two concentric layers: a radial halo bloom (low-opacity) and a solid core circle. Both colorize according to the QI glow scale. The QI number renders inside the core in the `hero` font family.

#### Variants

**Small (map bloom pin)**
- Core: 28px diameter, border-radius 14px
- Halo: 48px diameter, border-radius 24px, opacity 0.30
- Number: not shown (too small)
- Animation: none (too many on screen at once)
- Size also encodes QI: radius scales linearly from 24px (QI=0) to 40px (QI=100)

**Medium (zone detail)**
- Core: 96px diameter, border-radius 48px
- Halo: 140px diameter, border-radius 70px, opacity 0.25
- Number: Newsreader 32px inside core, ink-on-glow-color
- Animation: static

**Large (in-zone hero)**
- Core: 140px diameter, border-radius 70px
- Halo: 208px diameter, border-radius 104px, opacity 0.25
- Number: Newsreader 56px inside core
- Animation: halo breathes on 4s ease-in-out loop (scale 1.0 → 1.14 → 1.0). Core stays fixed — the score numeral never moves.
- Reduced motion: static halo at 1.07 scale

**Onboarding (animated cold→gold)**
- Use small variant size
- Color interpolates across slides: cold `#8A98A6` → amber `#D9A85E` → gold `#E8C170`
- Transition: 600ms `Animated.timing` on "Continue" tap. Reduced motion: instant swap.

---

### 2.2 Zone Bloom Marker (map)

Rendered as the Small orb variant inside `react-native-maps` `<Marker>`. Size scales linearly with QI (24px → 40px core). Color follows glow scale. No reading: `#3A3A3A` at 50% opacity. No breathing — the visual density of many markers creates ambient energy without individual animation.

---

### 2.3 Commitment Arc Dial

Centered, full-width component used inline on ZoneDetailScreen.

- **Track:** 240° arc, open at the bottom. Stroke width 6px, color `#E4DDD1` (border).
- **Fill:** same arc, filled from the start point, sage `#6B7F6E`.
- **Thumb:** 24px circle at arc tip, white fill, sage border 2px.
- **Center display:** selected minutes in Newsreader 48px (ink), "min" in `label` style below it.
- **Range:** 5–120 minutes in 5-minute steps.
- **Gesture:** pan along the arc path.
- **No tick marks** — cleaner and calmer.
- **Accessibility:** `accessibilityRole="adjustable"`, `accessibilityValue={{ min: 5, max: 120, now: value }}`.

---

### 2.4 Coach Card (anti-notification)

- Full-width, surface background (`#FBF8F2` light / `#23201A` dark), border-radius 20px, 16px padding
- Single line of warm body text (HankenGrotesk Regular, 15px, ink/nightWarmText), max 2 lines
- Small dismiss `×` in top-right (12px, muted color)
- No icon, no color accent, no urgency cues
- Enters: slides up 40px + 300ms ease-out. Exits: 200ms fade + slide down.
- Auto-dismisses after 8s if untouched
- Only one card at a time — never stacks
- Reduced motion: fade only (no slide)

---

### 2.5 Reward Chip / Wallet Card

- Surface background, border-radius 20px, 16px padding, full-width
- Left column: reward name (HankenGrotesk SemiBold 15px, ink) + point cost (caption, muted)
- Right: "Redeem" pill — sage fill + white SemiBold text when affordable; `#34301F` fill + muted text when not
- No icons, no imagery
- Redemption confirmation appears as an inline Coach Card, not an alert

---

### 2.6 Trend Calendar (rhythm view)

- 12-week × 7-day grid of rounded squares: 10px, border-radius 3px, 2px gap
- Cell color by daily avg silence score:
  - No session: `#E4DDD1`
  - Low (0–30): `#C8C0B0`
  - Medium (31–70): `#D9A85E` at 40% opacity
  - High (71–100): `#E8C170` at 60% opacity
  - Great (≥90): full `#E8C170`
- Week day labels (Mon / Wed / Fri) in `label` style on left axis
- Month markers in `caption` style along the top
- Below the grid: three stat chips in a row — total quiet hours (Newsreader 28px), current streak (days), best session (minutes) — each in a surface card, border-radius 16px

---

### 2.7 Bottom Tab Bar

- 4 tabs: **Map**, **Trends**, **Wallet**, **Settings**
- Background: `#FBF8F2` (surface) with hairline `#E4DDD1` top border
- Height: 56px + safe area inset
- Active: sage `#6B7F6E` icon fill + sage label (caption style)
- Inactive: `#8A8478` muted icon + muted label
- Icon style: 24px, simple outline (inactive) / filled (active)
- Active tab selection: 150ms scale pulse on icon (1.0 → 1.12 → 1.0)
- **No badge counts anywhere**
- Hidden on ActiveSession (immersive dark screen)

---

### 2.8 Buttons

**Primary (sage) — check-in actions**
- Full-width, 56px tall, border-radius 16px, sage fill `#6B7F6E`
- Text: HankenGrotesk SemiBold 15px, white
- Disabled: 40% opacity

**Primary (gold) — check-out only**
- Same dimensions, gold fill `#E8C170`
- Text: HankenGrotesk SemiBold 15px, `#16140F` (night)

**Secondary / ghost**
- No fill, ink text, border `#E4DDD1`, same dimensions
- Used for non-primary actions (Done, Close)

---

### 2.9 Text Input

- Border: `#E4DDD1`, border-radius 12px, 16px padding
- Text: ink, HankenGrotesk Regular 15px
- Placeholder: muted `#8A8478`
- Focus: border upgrades to sage `#6B7F6E`. No glow effect.

---

### 2.10 Empty State

- Centered on screen
- A dimmed small orb at `#C8C0B0` (no animation)
- One calm sentence: HankenGrotesk Regular 15px, muted
- Optional ghost CTA below
- Never an error icon

---

## 3. Screen Specifications

All screens are light mode unless noted. Tab bar is visible unless noted.

---

### 3.1 Onboarding — Slide 1 of 3

**Mode:** Light. **Tab bar:** Hidden.

Layout: full paper background (`#F5F1EA`). Vertically centered content stack.

1. Small orb in cold state (`#8A98A6`), no animation, centered
2. Headline: "Disconnect, together." — HankenGrotesk SemiBold 22px, ink, centered
3. Body: "Find spaces where putting your phone down is the norm — not the exception." — body style, muted, centered, max 2 lines
4. Primary sage button "Continue" pinned 24px above safe area bottom

---

### 3.2 Onboarding — Slide 2 of 3

**Mode:** Light. **Tab bar:** Hidden.

Same layout. Orb interpolates to amber (`#D9A85E`) on enter (600ms transition from slide 1).

1. Small orb in amber state
2. Headline: "Earn for your silence."
3. Body: "Every quiet minute earns points redeemable at the venue."
4. "Continue" button

---

### 3.3 Onboarding — Slide 3 of 3 (Privacy Promise)

**Mode:** Light. **Tab bar:** Hidden.

Orb interpolates to full gold (`#E8C170`) on enter.

1. Small orb in gold state
2. Headline: "Only a score leaves your phone."
3. Body: "Nothing you do, read, or say is ever seen. Just a number from 0 to 100."
4. Privacy chip: a small pill below the body text — surface background, border `#E4DDD1`, rounded 20px — containing "No content · No location history · No names" in `label` style, muted color
5. "Get started" primary sage button → navigates to Map

> **Note on permissions:** The existing `PermissionOnboardingScreen.tsx` already serves as the plain-language permissions primer (light mode, sage CTA, well-structured). It fires before the first zone check-in via `needsSilenceAgentOnboarding()` — this behavior is preserved unchanged. The onboarding slides end at the map; the permission screen fires naturally when the user selects their first zone. `PermissionOnboardingScreen` only needs minor polish: replace the empty `rowIcon` placeholder `<View>` with a small permission-category icon chip.

---

### 3.4 Map Screen

**Mode:** Light. **Tab bar:** Visible.

- Full-bleed `react-native-maps` with a light/warm map tile style (grey roads, paper-toned water)
- Floating "Hush" wordmark pill top-left: HankenGrotesk SemiBold 14px ink, surface background `rgba(251,248,242,0.9)`, border-radius 20px, 10px vertical / 16px horizontal padding, subtle backdrop blur
- No "Wallet" text button (moved to tab bar)
- Zone bloom markers: Small Orb variant, size-scaled by QI, breathing removed
- Bottom peek sheet: surface card, border-radius 20px top corners, 48px collapsed height, 24px padding
  - Collapsed: "X quiet zones nearby" body text, muted
  - Expanded (tap to expand): shows nearest zone name in heading style + medium orb displaying its QI + "Tap to visit" caption
- Empty state (no zones): peek sheet shows "No quiet zones near you yet" + ghost "Suggest a space" CTA

---

### 3.5 Zone Detail Screen

**Mode:** Light. **Tab bar:** Visible (zone detail is a modal sheet over the map, not a full push — slides up from the bottom, 90% screen height, border-radius 24px top).

> **Architecture note:** Implementing as a true bottom sheet requires a library (e.g. `@gorhom/bottom-sheet`) or a custom `Modal`. If adding a dependency is out of scope for the impeccable pass, ZoneDetail may remain a full-screen push — the visual design is identical; only the entry/exit animation and overlay behavior differ. The spec describes the modal sheet as the preferred target.

Layout (scrollable, 24px padding):

1. Zone name — heading style (22px SemiBold, ink)
2. "X people quietly here" — caption, muted, below name
3. Medium Orb (96px core) centered, showing zone's live QI
4. Soft divider (`#E4DDD1`, 1px, full-width), 24px margin vertical
5. "Your goal" label (label style, muted)
6. Commitment Arc Dial — inline, centered, full-width
7. Reward on offer — Reward Chip (read-only, no redeem button — just name + point value as a display card)
8. Geofence status — caption, muted, centered: "You're inside this zone" / "You're outside — you can still check in"
9. Primary sage "Check in" button, pinned above tab bar

---

### 3.6 Active Session Screen

**Mode:** Dark. **Tab bar:** Hidden (immersive full-screen).

Background: `#16140F`. Content centered vertically.

1. "Quiet now" — label style (10px SemiBold, 2 letter-spacing, uppercase), `nightLabel` color (`#8A7A54`)
2. Large Orb (140px core, 208px halo), breathing animation, gold glow, centered. User's live silence score (Newsreader 56px) inside core.
3. "Phone resting. Tap only to check out." — body 13px, `nightMuted`, centered, 24px below orb
4. Error text (if checkout fails) — alert color, body style
5. Two stat tiles side by side (max-width 280px, centered):
   - Left tile: remaining time (Newsreader 28px, nightWarmText) + "REMAINING" label
   - Right tile: live score again (Newsreader 28px, glowHigh `#E8C170`) + "YOUR SILENCE" label
   - Tile style: `nightCard` background, border-radius 16px, 14px padding
6. Coach Card slides in above button when a nudge fires (dark variant)
7. Gold primary "Check out" button pinned 32px above safe area bottom

---

### 3.7 Session Summary Screen

**Mode:** Light. **Tab bar:** Visible.

Calm return to light after a session.

1. "Session complete" — label style, muted, centered, 24px top margin
2. Three stat tiles in a row (full-width, gap 10px):
   - Quiet minutes (heroSmall / Newsreader 28px, ink)
   - Avg silence score (heroSmall, ink)
   - Points earned (heroSmall, rewardGold `#C9A24B`)
   - Each tile: surface card, border-radius 16px, 14px padding, centered
3. `sessionSummaryHint` text — body 14px, muted, centered, max-width 280px
4. 4-week trend preview: a slim slice of the Trend Calendar (same cell style) — 4 weeks wide, today's cell highlighted in full gold — giving context for where this session sits. **Dependency:** requires a `getSessionHistory()` lib call returning past session dates + scores. If this data is unavailable, omit the preview and show only the hint text.
5. "View wallet" — primary sage button
6. "Done" — ghost button below

---

### 3.8 Wallet Screen

**Mode:** Light. **Tab bar:** Visible.

1. "YOUR BALANCE" — label style, muted, centered
2. Balance value — Newsreader 48px, rewardGold `#C9A24B`, centered
3. Error / confirmation text: inline Coach Card style (not an alert)
4. Scrollable list of Reward Chips (gap 10px)
5. Empty rewards state: Empty State component ("No rewards available at this venue yet.")
6. Close / back handled by tab bar navigation (no explicit close button)

---

### 3.9 Trends Screen

**Mode:** Light. **Tab bar:** Visible.

1. "YOUR QUIET" — label style, muted, 24px top
2. 12-week Trend Calendar grid, full-width
3. Three stat chips below grid (total quiet hours · current streak · best session) in surface cards
4. Subtle divider
5. Area chart: 8-week window, daily avg silence score as a smooth curve. Fill: `#D9A85E` at 20% opacity. Stroke: `#D9A85E`. No gridlines. X-axis: week labels in caption style. Y-axis: none (the curve is enough). Chart height: 80px.
6. No comparisons, no ranks, no streak emoji. Just the data, calmly.

---

### 3.10 Settings / Privacy Center Screen

**Mode:** Light. **Tab bar:** Visible.

Simple list with three sections, each in a surface card (border-radius 20px, 0 padding between rows, hairline dividers between rows).

**Section 1 — Permissions**
- Toggle row: "Screen-off detection" — plain-language description below in caption/muted ("Lets Hush know when your phone is face-down or locked")
- Toggle row: "Notification pausing" — caption: "Used to measure your silence score. No notification content is read."
- Toggle style: system `Switch` component, track color sage when on

**Section 2 — Your data**
- Ghost button row: "Export my data" — ink text, right chevron
- Ghost button row: "Delete my account" — alert color `#B07A5E` text, no chevron (destructive, opens confirmation)

**Section 3 — About**
- Text row: app version (caption, muted)
- Link row: "Privacy policy" (body, sage, right chevron)

No notification toggles — Hush sends none.

---

## 4. Motion, Transitions & Accessibility

### 4.1 Reduced Motion

`AccessibilityInfo.isReduceMotionEnabled()` is checked once at app start and stored in a React context value (`useReducedMotion`). All animated components read this context. When true:
- All looping animations (orb breathing) become static at mid-point
- Enter/exit transitions become instant opacity cuts (no slides)
- Onboarding orb color change is instant

### 4.2 Screen Transitions

| From → To | Transition | Duration |
|---|---|---|
| Any tab switch | Cross-fade | 250ms |
| Map → ZoneDetail | Sheet slides up from bottom | 350ms ease-out |
| ZoneDetail → ActiveSession (check-in) | Fade to dark | 600ms |
| ActiveSession → SessionSummary (check-out) | Fade to light | 600ms |
| All other pushes | Cross-fade | 250ms |

The light→dark and dark→light transitions are slow and ceremonial — they mark the boundary between "normal world" and "quiet zone" as intentional.

### 4.3 Component Animations

| Component | Animation | Duration | Reduced motion |
|---|---|---|---|
| Orb halo (large) | Scale 1.0→1.14→1.0 loop | 4000ms ease-in-out | Static at 1.07 |
| Onboarding orb color | Interpolate cold→amber→gold | 600ms per step | Instant |
| Coach Card enter | Slide up 40px + fade in | 300ms ease-out | Fade only |
| Coach Card exit | Slide down 40px + fade out | 200ms | Fade only |
| Tab icon selection | Scale 1.0→1.12→1.0 | 150ms | None |

### 4.4 Haptics

Two moments only (`expo-haptics`):
- **Check-in confirmed:** `ImpactFeedbackStyle.Light`
- **Check-out confirmed:** `ImpactFeedbackStyle.Medium`

No haptics on tab switches, button presses, coach card dismissal, or dial adjustment.

### 4.5 General Accessibility

- All interactive elements: minimum 44×44pt touch target
- Color is never the sole differentiator — glow scale is always accompanied by the numeric QI value
- All non-decorative images and icons have `accessibilityLabel`
- Orb: `accessibilityRole="image"`, `accessibilityLabel="Quiet Index orb, score {value}"`
- Arc dial: `accessibilityRole="adjustable"`, `accessibilityValue={{ min: 5, max: 120, now: value }}`
- WCAG AA contrast for all text on all backgrounds

---

## 5. Existing Code Notes for Impeccable

These are specific gaps between the current `apps/mobile/` implementation and this spec:

1. **`MapScreen.tsx`** — The "Wallet" text button in top-right should be removed (moved to tab bar). The bloom marker size is fixed at 28px — it should scale 24–40px by QI value. The warm pill wordmark needs to be added top-left.
2. **`ZoneDetailScreen.tsx`** — Uses hardcoded hex values instead of `colors`/`fonts` from theme. Has no medium orb — QI is not shown at all. The `TextInput` for minutes should be replaced with the Arc Dial. Screen should be a modal sheet, not a full-screen push.
3. **`ActiveSessionScreen.tsx`** — Already well-implemented. Needs the "Phone resting. Tap only to check out." hint, and the two stat tiles could include the zone's collective QI (currently only shows user's score twice). The check-out button color should be gold, not the existing default.
4. **`SessionSummaryScreen.tsx`** — Needs the 4-week trend calendar preview. Light mode background (`#F5F1EA`) not currently applied (uses `colors.night`).
5. **`WalletScreen.tsx`** — Needs light mode background. Balance label + value are already styled well.
6. **`App.tsx`** — `backgroundColor: "#0E1116"` in the root container should become `#F5F1EA` (light) as the base; ActiveSession applies dark mode itself. No bottom tab bar exists yet — needs to be added.
7. **New screens to create:** `OnboardingScreen.tsx` (3 slides + permissions primer), `TrendsScreen.tsx`, `SettingsScreen.tsx`.
8. **`theme.ts`** — Missing light-mode tokens as named exports. Add `colors.background`, `colors.surface`, `colors.accent`, `colors.rewardGold` mapped to the values in §1.1 above.

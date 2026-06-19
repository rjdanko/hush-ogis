# Hush — Design Brief

> **For:** an AI design assistant tasked with producing **lo-fi wireframes/frames** and a **design palette / visual direction**.
> **Project:** Hush — a 100% software app that turns physical spaces into measurable, rewarded zones of intentional digital silence.
> **Deliverables requested:** (1) lo-fi frames for every screen listed in §5, (2) a color palette + typography + component style direction, (3) one or two "hero" frames taken to mid-fi to show the intended mood.

---

## 1. What this product is (context for the designer)

Hush lets people **put their phone down, together, in a real place** — a café, library, study hall, or co-working space — and get **rewarded** for it. Each space is a "zone." Every zone has a live **Quiet Index** (a `0–100` score of how digitally disconnected the people there are right now).

- **Users** open a map, find a glowing quiet zone nearby, check in with a personal commitment ("45 min off my phone"), lock their phone, and earn points redeemable at the venue.
- **Operators** (café/library owners) create zones, watch a live dashboard, and get an AI-written weekly digest.

The product's whole reason to exist is **the value of disconnection.** The design must *feel* like that — calm, spacious, quiet — not like another attention-grabbing app.

---

## 2. Design principles (the soul of the visual direction)

1. **Calm over engagement.** No red badges, no infinite feeds, no dopamine reds. The UI should feel like a deep breath. It is the *anti–social-media* app.
2. **Negative space is the brand.** Embrace emptiness (the Japanese concepts of *ma* 間 and *yohaku* 余白 — meaningful blank space). Generous margins. Few elements per screen. Let things breathe.
3. **Quiet motion.** Animations are slow, soft, and optional. Respect "reduced motion." A glow should *pulse like breathing* (~4s), never flash.
4. **One focal point per screen.** Each screen has a single clear thing to look at or do.
5. **Honest & private.** Visual cues that reinforce "we don't watch you" — show the single `0–100` score leaving the device, never raw data.
6. **Warm, human, analog-tinged.** Slightly tactile and soft, not cold sci-fi. Think "a quiet library at golden hour," not "a control panel."

---

## 3. Mood & visual references (direction, not prescription)

- **Mood words:** still, spacious, warm-minimal, meditative, trustworthy, gentle, focused.
- **Reference vibes:** Japanese stationery/muji minimalism · meditation apps (but warmer and less corporate) · the soft glow of paper lanterns · ink-on-rice-paper · the calm of an e-reader.
- **Avoid:** neon cyberpunk, harsh gradients, busy dashboards, gamified confetti, aggressive notification styling, pure clinical white-and-blue SaaS.

---

## 4. Suggested palette direction (designer may refine)

Aim for a **low-stimulation, warm-neutral base** with a single calm accent and a temperature-based "glow" scale for the Quiet Index.

**Base / neutrals (warm, paper-like)**
- Ink (near-black, warm): `#22201D`
- Charcoal text-secondary: `#4A463F`
- Warm paper background (light mode): `#F5F1EA`
- Soft card surface: `#FBF8F2`
- Hairline / borders: `#E4DDD1`

**Dark mode (for in-zone / phone-down moments — "night of the mind")**
- Deep warm black: `#16140F`
- Raised surface: `#23201A`
- Muted text: `#A9A296`

**Primary accent (calm, grounded — NOT a stimulating red/orange)**
- Suggested: a muted sage / deep teal / dusty indigo. Pick ONE.
  - Sage: `#6B7F6E`
  - Deep teal: `#3E6B66`
  - Dusty indigo: `#5A5F7D`

**Quiet Index "glow" scale (temperature ramp — the ONE place color does real work)**
- Low quiet (noisy, 0–30): cool, faded grey-blue `#8A98A6`
- Medium (31–70): warm amber `#D9A85E`
- High quiet (71–100): warm, full glow `#E8C170` → soft halo
- The glow is a *soft radial bloom*, low opacity, breathing animation — never a hard ring.

**Semantic (use sparingly, desaturated)**
- Success/reward: muted gold `#C9A24B`
- Gentle alert: dusty clay `#B07A5E` (never bright red)

> The palette must pass WCAG AA contrast for text. Color carries meaning in exactly one place (the Quiet Index glow); everywhere else, rely on space and type.

---

## 5. Screens to wireframe (lo-fi frames needed)

Frame everything for **mobile (user app, primary)** and **web (operator dashboard, secondary)**. Mark each frame mobile or web.

### 5.1 User Mobile App (primary — design these first)

1. **Onboarding / value intro (2–3 frames)** — calm, single-message-per-screen explanation: "Disconnect, together." → "Earn for your silence." → privacy promise ("Only a score leaves your phone, nothing else"). Include a permissions-priming screen explained in plain language.
2. **Live Zone Map (HERO frame)** — a map with nearby zones rendered as **soft glowing blooms** sized/colored by current Quiet Index. Minimal chrome. One floating "find quiet near me" control. A peek/bottom-sheet for the nearest zone.
3. **Zone detail / pre-check-in** — zone name, live Quiet Index (big, central), active people count, the silence contract ("target: 45 min"), reward on offer, and a primary "Check in" action.
4. **Commitment setter** — choose your personal silence commitment (e.g. a calm dial/slider for minutes). Single focal element.
5. **In-zone / active session (HERO frame)** — the screen you see while disconnected. Should be **beautiful enough to be the last thing you look at before locking the phone.** Shows: your live silence score, time remaining, the zone's collective Quiet Index breathing, and a gentle encouragement. Designed to be glanceable and then ignored.
6. **Coach nudge state(s)** — gentle, never-shaming micro-messages (e.g. "You usually manage 30 min here — nicely past it."). Show as soft, dismissible, low-urgency overlays/cards — the opposite of a notification.
7. **Check-out / session summary** — minutes achieved, silence score, a calm trend visual over time, points earned. Quiet celebration (no confetti — maybe a soft bloom).
8. **Reward wallet** — points balance, available rewards at venues, redemption flow, redemption history.
9. **Personal trends / "your quiet"** — private, non-comparative history. Streaks shown gently, never as a leaderboard.
10. **Settings / privacy center** — permission toggles, plain-language data explanation, delete-my-data.

### 5.2 Operator Dashboard (web — secondary)

11. **Zone setup** — draw a zone boundary on a map, set the silence contract, define reward + point value.
12. **Live feed** — real-time Quiet Index (big), active check-in count, current average silence score. Calm, not a "war room."
13. **Analytics** — historical Quiet Index trend chart, peak quiet windows, and the **AI-written weekly digest** rendered as readable prose with a few suggestion cards.
14. **Certification badge** — preview + embed code for the venue's verified average Quiet Index badge.
15. **Reward management** — define/edit rewards, set point values, view redemption history, adjust thresholds.

---

## 6. Key components / patterns the designer should define

- **Quiet Index dial/orb** — the signature component. A soft, breathing radial glow showing a `0–100` value. Define small (map pin), medium (zone detail), and large (in-zone hero) variants.
- **Zone bloom (map marker)** — soft radial marker, size + glow tied to Quiet Index. Define noisy vs. quiet states.
- **Commitment dial** — calm minutes selector.
- **Coach card** — low-urgency, dismissible, warm tone. Define the "anti-notification" style.
- **Trend visual** — minimal line/area chart, warm palette, no gridline clutter.
- **Reward chip / wallet card.**
- **Buttons & inputs** — soft corners, generous padding, no hard shadows; one primary action per screen.
- **Empty states** — these matter a lot for a "calm" app; design "no quiet zones near you yet" thoughtfully (an opportunity, not an error).

---

## 7. Typography direction (designer may refine)

- **Feel:** humanist, readable, a little warm. Pairs well with lots of whitespace.
- **Suggested:** a warm humanist sans for UI (e.g. Inter, General Sans, or similar) + optionally a soft serif for large hero numbers/headings to add calm character. The big Quiet Index number is a visual moment — give it weight and air.
- Large, comfortable line-height. Few weights. Generous letter-spacing on small labels.

---

## 8. Interaction & motion notes

- **Breathing glow:** Quiet Index orb/blooms pulse on a slow ~4s ease-in-out loop.
- **Transitions:** slow cross-fades over slides; nothing snappy or bouncy.
- **Haptics:** soft, rare — a single gentle pulse on check-in/check-out only.
- **No:** badges with counts, red dots, autoplay, pull-to-refresh spinners that feel anxious.
- **Reduced-motion mode:** all looping animation becomes static; this is a first-class state, not an afterthought.

---

## 9. What "done" looks like for this brief

- Lo-fi frames for **all screens in §5**, labeled and in a sensible flow order (user app flow, then operator flow).
- A **defined palette** (final hex values), **type scale**, and **core component styles**.
- The two HERO frames (**Live Zone Map** and **In-zone / active session**) taken to **mid-fi** to communicate the intended calm, warm, glowing mood.
- A short rationale connecting the visual choices back to the principle: *this is the app that respects your attention by asking for almost none of it.*

---

*Companion document: see `Hush-PRD.md` in this folder for full product requirements, features, and architecture.*

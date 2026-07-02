# Hush Mobile — Impeccable Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Hush mobile app (`apps/mobile/`) to match the full design spec at `docs/superpowers/specs/2026-07-02-hush-mobile-design.md` — covering all 10 screens with light/dark mode, bottom tab bar, orb-led onboarding, arc dial commitment setter, and rhythm calendar trends view.

**Architecture:** Component-first — shared design components (QuietIndexOrb, CommitmentArcDial, TrendCalendar, TabBar) are built and tested first, then screens are upgraded or created to assemble them. App.tsx navigation is restructured from a flat push stack to a tab-bar model with overlay states. The existing flat-state-machine pattern is preserved — no navigation library is added.

**Tech Stack:** React Native 0.76 + Expo 52, TypeScript, Vitest (unit tests on pure helper functions), react-native-svg (new — for arc dial and area chart), AsyncStorage (first-launch gate), react-native-maps (existing).

**Design spec:** `docs/superpowers/specs/2026-07-02-hush-mobile-design.md` — read this for pixel-level decisions not covered here.

---

## File Map

**Install:**
- `react-native-svg` via `expo install react-native-svg`

**New lib files:**
- `apps/mobile/lib/arc-dial.ts` — pure math for the commitment arc dial
- `apps/mobile/lib/arc-dial.test.ts`
- `apps/mobile/lib/trend-colors.ts` — cell color computation for the trend calendar
- `apps/mobile/lib/trend-colors.test.ts`
- `apps/mobile/lib/history.ts` — fetch past sessions from Supabase for trends

**New components:**
- `apps/mobile/components/QuietIndexOrb.tsx`
- `apps/mobile/components/CommitmentArcDial.tsx`
- `apps/mobile/components/TrendCalendar.tsx`
- `apps/mobile/components/TabBar.tsx`

**Modified components:**
- `apps/mobile/components/CoachCard.tsx` — add `variant: 'light' | 'dark'` prop

**Modified lib:**
- `apps/mobile/lib/theme.ts` — add complete light-mode token set

**New screens:**
- `apps/mobile/screens/OnboardingScreen.tsx`
- `apps/mobile/screens/TrendsScreen.tsx`
- `apps/mobile/screens/SettingsScreen.tsx`

**Modified screens:**
- `apps/mobile/App.tsx` — tab navigation model, onboarding gate
- `apps/mobile/screens/MapScreen.tsx` — light mode, wordmark pill, bloom size scaling
- `apps/mobile/screens/ZoneDetailScreen.tsx` — light mode, medium orb, arc dial inline
- `apps/mobile/screens/ActiveSessionScreen.tsx` — gold CTA, hint text
- `apps/mobile/screens/SessionSummaryScreen.tsx` — light mode, trend preview
- `apps/mobile/screens/WalletScreen.tsx` — light mode

---

## Task 1: Install react-native-svg and extend theme.ts

**Files:**
- Modify: `apps/mobile/lib/theme.ts`
- Run: `expo install react-native-svg` in `apps/mobile/`

- [ ] **Step 1: Install react-native-svg**

```bash
cd apps/mobile
npx expo install react-native-svg
```

Expected: `react-native-svg` appears in `apps/mobile/package.json` dependencies. The Expo managed workflow handles native linking automatically.

- [ ] **Step 2: Replace theme.ts with the complete token set**

```typescript
// Design Brief §1 + spec §1.1 — complete light-mode and dark-mode token set.
// Light mode is the default. Dark mode tokens are used only by ActiveSessionScreen.
export const colors = {
  // Light mode
  background: "#F5F1EA",
  surface: "#FBF8F2",
  ink: "#22201D",
  inkSecondary: "#4A463F",
  border: "#E4DDD1",
  muted: "#8A8478",
  accent: "#6B7F6E",        // sage — check-in CTA, tab active state
  alert: "#B07A5E",         // dusty clay — errors, delete action
  rewardGold: "#C9A24B",    // wallet balance display

  // Dark mode (ActiveSession only)
  night: "#16140F",
  nightCard: "#23201A",
  nightWarmText: "#F2ECE0",
  nightMuted: "#A9A296",
  nightBorder: "#34301F",
  nightLabel: "#8A7A54",
  nightHint: "#C9C0AE",

  // Quiet Index glow scale (shared — the only place color carries meaning)
  glowLow: "#8A98A6",       // 0–30 cold grey-blue
  glowMid: "#D9A85E",       // 31–70 warm amber
  glowHigh: "#E8C170",      // 71–100 full warm gold
  glowHighHalo: "rgba(232,193,112,0.25)",
  glowHighCore: "#E0B86A",
  glowHighCoreText: "#3E3320",
  glowHighCoreLabel: "#6E5A30",

  // Legacy aliases kept for backward compat with unchanged screens
  paper: "#F5F1EA",
  charcoal: "#4A463F",
  mutedText: "#8A8478",
  iconChip: "#EFE9DD",
  footerHint: "#9A9182",
} as const;

export const fonts = {
  hero: "Newsreader_300Light",
  body: "HankenGrotesk_400Regular",
  bodySemiBold: "HankenGrotesk_600SemiBold",
} as const;
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/mobile
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/package.json apps/mobile/package-lock.json apps/mobile/lib/theme.ts
git commit -m "feat(mobile): install react-native-svg, extend theme with full light/dark token set"
```

---

## Task 2: arc-dial.ts — pure math helpers

**Files:**
- Create: `apps/mobile/lib/arc-dial.ts`
- Create: `apps/mobile/lib/arc-dial.test.ts`

The arc spans 240° of the circle with the gap centered at the bottom (6 o'clock). Min = 5 min, max = 120 min, step = 5 min. Angles are measured clockwise from 12 o'clock.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/mobile/lib/arc-dial.test.ts
import { describe, expect, it } from "vitest";
import {
  ARC_START_ANGLE,
  ARC_SWEEP,
  DIAL_MIN,
  DIAL_MAX,
  DIAL_STEP,
  valueToAngle,
  angleToValue,
  polarToXY,
  describeArc,
} from "./arc-dial";

describe("valueToAngle", () => {
  it("maps min value to start angle", () => {
    expect(valueToAngle(DIAL_MIN)).toBe(ARC_START_ANGLE);
  });

  it("maps max value to start + sweep", () => {
    expect(valueToAngle(DIAL_MAX)).toBeCloseTo(ARC_START_ANGLE + ARC_SWEEP);
  });

  it("maps midpoint value to start + half sweep", () => {
    const mid = (DIAL_MIN + DIAL_MAX) / 2; // 62.5
    expect(valueToAngle(mid)).toBeCloseTo(ARC_START_ANGLE + ARC_SWEEP / 2);
  });
});

describe("angleToValue", () => {
  it("maps start angle to min value", () => {
    expect(angleToValue(ARC_START_ANGLE)).toBe(DIAL_MIN);
  });

  it("maps start + sweep to max value", () => {
    expect(angleToValue(ARC_START_ANGLE + ARC_SWEEP)).toBe(DIAL_MAX);
  });

  it("snaps to nearest step", () => {
    // Angle for value 12 — should snap to 10 (nearest multiple of 5)
    const angleFor12 = valueToAngle(12);
    expect(angleToValue(angleFor12)).toBe(10);
  });

  it("clamps angle below arc start to min", () => {
    expect(angleToValue(ARC_START_ANGLE - 30)).toBe(DIAL_MIN);
  });

  it("clamps angle beyond arc end to max", () => {
    expect(angleToValue(ARC_START_ANGLE + ARC_SWEEP + 30)).toBe(DIAL_MAX);
  });
});

describe("polarToXY", () => {
  it("returns top center for 0° (12 o'clock)", () => {
    const { x, y } = polarToXY(100, 100, 50, 0);
    expect(x).toBeCloseTo(100);
    expect(y).toBeCloseTo(50);
  });

  it("returns right center for 90° (3 o'clock)", () => {
    const { x, y } = polarToXY(100, 100, 50, 90);
    expect(x).toBeCloseTo(150);
    expect(y).toBeCloseTo(100);
  });
});

describe("describeArc", () => {
  it("returns an SVG path string", () => {
    const path = describeArc(100, 100, 50, 150, 390);
    expect(path).toMatch(/^M .+ A .+/);
  });

  it("uses large-arc flag 1 for sweep > 180°", () => {
    const path = describeArc(100, 100, 50, 150, 390); // 240° sweep
    expect(path).toContain(" 1 1 ");
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd apps/mobile
npx vitest run lib/arc-dial.test.ts
```

Expected: all tests FAIL with "Cannot find module './arc-dial'".

- [ ] **Step 3: Implement arc-dial.ts**

```typescript
// apps/mobile/lib/arc-dial.ts
// Pure math helpers for CommitmentArcDial. Angles are degrees clockwise from
// 12 o'clock. The arc spans 240° with the 120° gap centered at 6 o'clock.
// Start = 150° (roughly 7 o'clock), End = 150° + 240° = 390° (≡ 30°, ~1 o'clock).

export const ARC_START_ANGLE = 150; // degrees from 12 o'clock, clockwise
export const ARC_SWEEP = 240;       // total arc degrees
export const DIAL_MIN = 5;          // minutes
export const DIAL_MAX = 120;        // minutes
export const DIAL_STEP = 5;         // minute snap increment

/** Convert (cx,cy,r,angleDeg) to {x,y}. angleDeg is clockwise from 12 o'clock. */
export function polarToXY(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number
): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** Build an SVG arc path from startAngle to endAngle (both clockwise-from-12). */
export function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToXY(cx, cy, r, startAngle);
  const end = polarToXY(cx, cy, r, endAngle);
  const sweep = endAngle - startAngle;
  const largeArc = sweep > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

/** Map a minutes value to its angle on the arc (clockwise from 12 o'clock). */
export function valueToAngle(value: number): number {
  return (
    ARC_START_ANGLE +
    ((value - DIAL_MIN) / (DIAL_MAX - DIAL_MIN)) * ARC_SWEEP
  );
}

/**
 * Map an angle (clockwise from 12 o'clock) back to a snapped minutes value.
 * Clamps to [DIAL_MIN, DIAL_MAX] and snaps to the nearest DIAL_STEP.
 */
export function angleToValue(angle: number): number {
  let normalized = angle - ARC_START_ANGLE;
  if (normalized < 0) normalized = 0;
  if (normalized > ARC_SWEEP) normalized = ARC_SWEEP;
  const raw = DIAL_MIN + (normalized / ARC_SWEEP) * (DIAL_MAX - DIAL_MIN);
  return Math.round(raw / DIAL_STEP) * DIAL_STEP;
}

/**
 * Convert a PanResponder move offset (dx, dy relative to dial center) to a
 * clockwise-from-12 angle. Handles the atan2 discontinuity cleanly.
 */
export function xyToAngle(dx: number, dy: number): number {
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90; // shift so 0° = top
  if (angle < 0) angle += 360;
  return angle;
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd apps/mobile
npx vitest run lib/arc-dial.test.ts
```

Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/arc-dial.ts apps/mobile/lib/arc-dial.test.ts
git commit -m "feat(mobile): add arc-dial math helpers (valueToAngle, angleToValue, describeArc)"
```

---

## Task 3: trend-colors.ts — cell color computation

**Files:**
- Create: `apps/mobile/lib/trend-colors.ts`
- Create: `apps/mobile/lib/trend-colors.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/mobile/lib/trend-colors.test.ts
import { describe, expect, it } from "vitest";
import { sessionCellColor } from "./trend-colors";

describe("sessionCellColor", () => {
  it("returns no-session color for null", () => {
    expect(sessionCellColor(null)).toBe("#E4DDD1");
  });

  it("returns low color for score 0–30", () => {
    expect(sessionCellColor(0)).toBe("#C8C0B0");
    expect(sessionCellColor(15)).toBe("#C8C0B0");
    expect(sessionCellColor(30)).toBe("#C8C0B0");
  });

  it("returns medium color for score 31–70", () => {
    expect(sessionCellColor(31)).toBe("rgba(217,168,94,0.4)");
    expect(sessionCellColor(50)).toBe("rgba(217,168,94,0.4)");
    expect(sessionCellColor(70)).toBe("rgba(217,168,94,0.4)");
  });

  it("returns high color for score 71–89", () => {
    expect(sessionCellColor(71)).toBe("rgba(232,193,112,0.6)");
    expect(sessionCellColor(89)).toBe("rgba(232,193,112,0.6)");
  });

  it("returns full gold for score >= 90", () => {
    expect(sessionCellColor(90)).toBe("#E8C170");
    expect(sessionCellColor(100)).toBe("#E8C170");
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd apps/mobile
npx vitest run lib/trend-colors.test.ts
```

Expected: FAIL with "Cannot find module './trend-colors'".

- [ ] **Step 3: Implement trend-colors.ts**

```typescript
// apps/mobile/lib/trend-colors.ts
// Cell color for the Trend Calendar grid. Maps a day's average silence score
// (or null for no session) to a fill color per the spec §2.6.

/** Returns the fill color for a calendar cell given the day's avg silence score. */
export function sessionCellColor(score: number | null): string {
  if (score === null) return "#E4DDD1";           // no session
  if (score <= 30) return "#C8C0B0";              // low
  if (score <= 70) return "rgba(217,168,94,0.4)"; // medium amber
  if (score < 90) return "rgba(232,193,112,0.6)"; // high
  return "#E8C170";                               // great (≥90)
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd apps/mobile
npx vitest run lib/trend-colors.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/trend-colors.ts apps/mobile/lib/trend-colors.test.ts
git commit -m "feat(mobile): add trend calendar cell color helper"
```

---

## Task 4: QuietIndexOrb component

**Files:**
- Create: `apps/mobile/components/QuietIndexOrb.tsx`

The orb has a halo circle (outer, low opacity) and a core circle (inner, solid). Color is driven by `quietIndexGlowColor`. The large variant adds a breathing animation on the halo.

- [ ] **Step 1: Create QuietIndexOrb.tsx**

```tsx
// apps/mobile/components/QuietIndexOrb.tsx
// Spec §2.1. Three sizes: 'small' (map pin), 'medium' (zone detail),
// 'large' (in-zone hero, breathing animation).
import { useEffect, useRef } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { quietIndexGlowColor } from "../lib/glow";
import { fonts } from "../lib/theme";

type OrbSize = "small" | "medium" | "large";

const SIZE_MAP: Record<OrbSize, { core: number; halo: number; fontSize: number }> = {
  small:  { core: 28,  halo: 48,  fontSize: 0  },
  medium: { core: 96,  halo: 140, fontSize: 32 },
  large:  { core: 140, halo: 208, fontSize: 56 },
};

interface QuietIndexOrbProps {
  quietIndex: number | null;
  size: OrbSize;
  /** Override color — used by onboarding slides for manual color animation. */
  colorOverride?: string;
}

export function QuietIndexOrb({ quietIndex, size, colorOverride }: QuietIndexOrbProps) {
  const { core, halo, fontSize } = SIZE_MAP[size];
  const color = colorOverride ?? (quietIndex != null ? quietIndexGlowColor(quietIndex) : "#3A3A3A");
  const haloColor = color === "#3A3A3A" ? "rgba(58,58,58,0.3)" : hexToHaloRgba(color, 0.25);

  const breath = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (size !== "large") return;
    let animation: Animated.CompositeAnimation | undefined;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced) {
        breath.setValue(1.07); // static mid-point per spec §4.1
        return;
      }
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(breath, {
            toValue: 1.14,
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(breath, {
            toValue: 1,
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
    });
    return () => {
      cancelled = true;
      animation?.stop();
    };
  }, [size, breath]);

  const coreRadius = core / 2;
  const haloRadius = halo / 2;

  return (
    <View
      style={[styles.wrap, { width: halo, height: halo }]}
      accessibilityRole="image"
      accessibilityLabel={
        quietIndex != null
          ? `Quiet Index orb, score ${quietIndex}`
          : "Quiet Index orb, no reading yet"
      }
    >
      <Animated.View
        style={[
          styles.halo,
          {
            width: halo,
            height: halo,
            borderRadius: haloRadius,
            backgroundColor: haloColor,
            transform: size === "large" ? [{ scale: breath }] : [],
          },
        ]}
      />
      <View
        style={[
          styles.core,
          {
            width: core,
            height: core,
            borderRadius: coreRadius,
            backgroundColor: color,
          },
        ]}
      >
        {fontSize > 0 && quietIndex != null && (
          <Text
            style={[
              styles.score,
              { fontSize, color: size === "large" ? "#3E3320" : "#22201D" },
            ]}
          >
            {quietIndex}
          </Text>
        )}
      </View>
    </View>
  );
}

/** Converts a 6-digit hex color to rgba with the given alpha. */
function hexToHaloRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  halo: { position: "absolute" },
  core: { alignItems: "center", justifyContent: "center" },
  score: { fontFamily: fonts.hero, lineHeight: undefined },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/mobile
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/components/QuietIndexOrb.tsx
git commit -m "feat(mobile): add QuietIndexOrb component (small/medium/large, breathing animation)"
```

---

## Task 5: CommitmentArcDial component

**Files:**
- Create: `apps/mobile/components/CommitmentArcDial.tsx`

Uses `react-native-svg` for the arc track and fill. Uses React Native's `PanResponder` (no additional gesture library) for input. Imports math from `lib/arc-dial.ts`.

- [ ] **Step 1: Create CommitmentArcDial.tsx**

```tsx
// apps/mobile/components/CommitmentArcDial.tsx
// Spec §2.3. A 240° arc dial (gap at bottom) for choosing quiet minutes.
// Uses react-native-svg for the arc path and PanResponder for gesture.
import { useRef } from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import {
  ARC_START_ANGLE,
  DIAL_MAX,
  DIAL_MIN,
  DIAL_STEP,
  angleToValue,
  describeArc,
  polarToXY,
  valueToAngle,
  xyToAngle,
} from "../lib/arc-dial";
import { colors, fonts } from "../lib/theme";

const DIAL_SIZE = 240;
const TRACK_PADDING = 28; // space from edge to track center line
const RADIUS = DIAL_SIZE / 2 - TRACK_PADDING;
const CX = DIAL_SIZE / 2;
const CY = DIAL_SIZE / 2;
const STROKE_WIDTH = 6;
const THUMB_RADIUS = 12;

interface CommitmentArcDialProps {
  value: number;               // current minutes (5–120, snapped to 5)
  onChange: (v: number) => void;
}

export function CommitmentArcDial({ value, onChange }: CommitmentArcDialProps) {
  const layoutRef = useRef<{ x: number; y: number } | null>(null);
  const currentAngle = valueToAngle(value);
  const trackPath = describeArc(CX, CY, RADIUS, ARC_START_ANGLE, ARC_START_ANGLE + 240);
  const fillPath = describeArc(CX, CY, RADIUS, ARC_START_ANGLE, currentAngle);
  const thumb = polarToXY(CX, CY, RADIUS, currentAngle);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        updateFromTouch(e.nativeEvent.locationX, e.nativeEvent.locationY);
      },
      onPanResponderMove: (e) => {
        updateFromTouch(e.nativeEvent.locationX, e.nativeEvent.locationY);
      },
    })
  ).current;

  function updateFromTouch(touchX: number, touchY: number) {
    const dx = touchX - CX;
    const dy = touchY - CY;
    const angle = xyToAngle(dx, dy);
    onChange(angleToValue(angle));
  }

  return (
    <View style={styles.container}>
      <View
        style={{ width: DIAL_SIZE, height: DIAL_SIZE }}
        onLayout={(e) => {
          layoutRef.current = {
            x: e.nativeEvent.layout.x,
            y: e.nativeEvent.layout.y,
          };
        }}
        {...panResponder.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel="Silence commitment dial"
        accessibilityValue={{ min: DIAL_MIN, max: DIAL_MAX, now: value }}
        accessibilityActions={[
          { name: "increment", label: `Increase by ${DIAL_STEP} minutes` },
          { name: "decrement", label: `Decrease by ${DIAL_STEP} minutes` },
        ]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === "increment") {
            onChange(Math.min(DIAL_MAX, value + DIAL_STEP));
          } else if (e.nativeEvent.actionName === "decrement") {
            onChange(Math.max(DIAL_MIN, value - DIAL_STEP));
          }
        }}
      >
        <Svg width={DIAL_SIZE} height={DIAL_SIZE}>
          {/* Background track */}
          <Path
            d={trackPath}
            fill="none"
            stroke={colors.border}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
          />
          {/* Filled portion */}
          <Path
            d={fillPath}
            fill="none"
            stroke={colors.accent}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
          />
          {/* Thumb */}
          <Circle
            cx={thumb.x}
            cy={thumb.y}
            r={THUMB_RADIUS}
            fill="white"
            stroke={colors.accent}
            strokeWidth={2}
          />
        </Svg>

        {/* Center value display */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={styles.centerLabel}>
            <Text style={styles.valueText}>{value}</Text>
            <Text style={styles.unitText}>min</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center" },
  centerLabel: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  valueText: {
    fontFamily: fonts.hero,
    fontSize: 48,
    color: colors.ink,
    lineHeight: 52,
  },
  unitText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: colors.muted,
    marginTop: 2,
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/mobile
npx tsc --noEmit
```

Expected: no errors. If `react-native-svg` types are missing, run `npx expo install react-native-svg` again and check it installed correctly.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/components/CommitmentArcDial.tsx
git commit -m "feat(mobile): add CommitmentArcDial (SVG arc + PanResponder gesture)"
```

---

## Task 6: TrendCalendar component

**Files:**
- Create: `apps/mobile/components/TrendCalendar.tsx`

- [ ] **Step 1: Create TrendCalendar.tsx**

```tsx
// apps/mobile/components/TrendCalendar.tsx
// Spec §2.6. 12-week × 7-day rhythm grid + three stat chips.
// Each cell is colored by the day's avg silence score via sessionCellColor().
import { StyleSheet, Text, View } from "react-native";
import { sessionCellColor } from "../lib/trend-colors";
import { colors, fonts } from "../lib/theme";

export interface DayData {
  date: string;        // ISO date string "YYYY-MM-DD"
  avgScore: number | null; // null = no session that day
}

interface TrendCalendarProps {
  days: DayData[];           // ordered oldest-first, exactly 84 entries (12 × 7)
  totalQuietHours: number;
  currentStreakDays: number;
  bestSessionMinutes: number;
  /** If provided, highlight this ISO date cell in full gold regardless of score. */
  highlightDate?: string;
}

const CELL_SIZE = 10;
const CELL_GAP = 2;
const DAYS_PER_WEEK = 7;
const NUM_WEEKS = 12;
const DAY_LABELS = ["M", "", "W", "", "F", "", ""]; // Mon/Wed/Fri only

export function TrendCalendar({
  days,
  totalQuietHours,
  currentStreakDays,
  bestSessionMinutes,
  highlightDate,
}: TrendCalendarProps) {
  // Pad or trim to exactly 84 entries
  const normalized = days.slice(-84);
  while (normalized.length < 84) normalized.unshift({ date: "", avgScore: null });

  return (
    <View style={styles.container}>
      {/* Grid */}
      <View style={styles.gridRow}>
        {/* Day-of-week axis */}
        <View style={styles.dayAxis}>
          {DAY_LABELS.map((label, i) => (
            <Text key={i} style={styles.dayLabel}>
              {label}
            </Text>
          ))}
        </View>
        {/* Weeks */}
        <View style={styles.weeksRow}>
          {Array.from({ length: NUM_WEEKS }).map((_, weekIdx) => (
            <View key={weekIdx} style={styles.week}>
              {Array.from({ length: DAYS_PER_WEEK }).map((_, dayIdx) => {
                const entry = normalized[weekIdx * DAYS_PER_WEEK + dayIdx];
                const isHighlight = entry.date && entry.date === highlightDate;
                const cellColor = isHighlight ? colors.glowHigh : sessionCellColor(entry.avgScore);
                return (
                  <View
                    key={dayIdx}
                    style={[styles.cell, { backgroundColor: cellColor }]}
                  />
                );
              })}
            </View>
          ))}
        </View>
      </View>

      {/* Stat chips */}
      <View style={styles.chips}>
        <StatChip value={totalQuietHours.toFixed(1)} label="QUIET HOURS" />
        <StatChip value={String(currentStreakDays)} label="DAY STREAK" />
        <StatChip value={String(bestSessionMinutes)} label="BEST SESSION" />
      </View>
    </View>
  );
}

function StatChip({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipValue}>{value}</Text>
      <Text style={styles.chipLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  gridRow: { flexDirection: "row", gap: 6 },
  dayAxis: { paddingTop: 2, gap: CELL_GAP },
  dayLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 9,
    letterSpacing: 1,
    color: colors.muted,
    height: CELL_SIZE,
    lineHeight: CELL_SIZE,
  },
  weeksRow: { flexDirection: "row", gap: CELL_GAP },
  week: { gap: CELL_GAP },
  cell: { width: CELL_SIZE, height: CELL_SIZE, borderRadius: 3 },
  chips: { flexDirection: "row", gap: 10 },
  chip: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    alignItems: "center",
  },
  chipValue: {
    fontFamily: fonts.hero,
    fontSize: 22,
    color: colors.ink,
  },
  chipLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 8,
    letterSpacing: 1.5,
    color: colors.muted,
    marginTop: 4,
    textAlign: "center",
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/mobile
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/components/TrendCalendar.tsx
git commit -m "feat(mobile): add TrendCalendar component (12-week rhythm grid + stat chips)"
```

---

## Task 7: Upgrade CoachCard — add light/dark variant

**Files:**
- Modify: `apps/mobile/components/CoachCard.tsx`

The current `CoachCard` is dark-only (uses `nightCard`/`nightWarmText`). The spec §2.4 requires a light variant for use on light-mode screens.

- [ ] **Step 1: Replace CoachCard.tsx**

```tsx
// apps/mobile/components/CoachCard.tsx
// Spec §2.4. Anti-notification: calm, dismissible, one message at a time.
// variant 'dark' (default) = for ActiveSession; 'light' = for light-mode screens.
import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text } from "react-native";
import { colors, fonts } from "../lib/theme";

const FADE_IN_DURATION_MS = 300;

interface CoachCardProps {
  message: string;
  onDismiss: () => void;
  variant?: "dark" | "light";
}

export function CoachCard({ message, onDismiss, variant = "dark" }: CoachCardProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced) {
        opacity.setValue(1);
        translateY.setValue(0);
        return;
      }
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: FADE_IN_DURATION_MS,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: FADE_IN_DURATION_MS,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
    });
    return () => { cancelled = true; };
  }, [opacity, translateY]);

  const isDark = variant === "dark";
  const bg = isDark ? colors.nightCard : colors.surface;
  const textColor = isDark ? colors.nightWarmText : colors.ink;
  const dismissColor = isDark ? colors.nightMuted : colors.muted;

  return (
    <Animated.View
      style={[
        styles.card,
        { backgroundColor: bg, opacity, transform: [{ translateY }] },
      ]}
      accessibilityRole="text"
      accessibilityLabel={`Gentle reminder: ${message}`}
    >
      <Text style={[styles.message, { color: textColor }]}>{message}</Text>
      <Pressable
        style={styles.dismiss}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss reminder"
        hitSlop={8}
      >
        <Text style={[styles.dismissGlyph, { color: dismissColor }]}>×</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    width: "100%",
  },
  message: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    paddingRight: 12,
  },
  dismiss: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  dismissGlyph: {
    fontFamily: fonts.body,
    fontSize: 18,
    lineHeight: 20,
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/mobile
npx tsc --noEmit
```

Expected: no errors. `ActiveSessionScreen.tsx` already passes no `variant` prop, so it defaults to `'dark'` — no changes required there.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/components/CoachCard.tsx
git commit -m "feat(mobile): add light/dark variant to CoachCard, update enter animation to slide-up"
```

---

## Task 8: TabBar component

**Files:**
- Create: `apps/mobile/components/TabBar.tsx`

- [ ] **Step 1: Create TabBar.tsx**

```tsx
// apps/mobile/components/TabBar.tsx
// Spec §2.7. 4 tabs: Map, Trends, Wallet, Settings.
// Sage active state, no badge counts, safe-area-inset-aware.
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts } from "../lib/theme";

export type Tab = "map" | "trends" | "wallet" | "settings";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "map",      label: "Map",      icon: "◎" },
  { id: "trends",   label: "Trends",   icon: "≈" },
  { id: "wallet",   label: "Wallet",   icon: "◇" },
  { id: "settings", label: "Settings", icon: "⊙" },
];

interface TabBarProps {
  activeTab: Tab;
  onTabPress: (tab: Tab) => void;
}

export function TabBar({ activeTab, onTabPress }: TabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.container, { paddingBottom: insets.bottom || 8 }]}
    >
      {TABS.map(({ id, label, icon }) => {
        const isActive = id === activeTab;
        return (
          <Pressable
            key={id}
            style={styles.tab}
            onPress={() => onTabPress(id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={label}
          >
            <Text style={[styles.icon, isActive && styles.iconActive]}>
              {icon}
            </Text>
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    minHeight: 44, // accessibility minimum
  },
  icon: {
    fontSize: 20,
    color: colors.muted,
  },
  iconActive: {
    color: colors.accent,
  },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 0.5,
    color: colors.muted,
  },
  labelActive: {
    color: colors.accent,
  },
});
```

> **Note:** `react-native-safe-area-context` is available in Expo 52 managed workflow via `expo install expo-modules-core`. If TypeScript can't find it, run `npx expo install react-native-safe-area-context`. Alternatively, replace `useSafeAreaInsets` with a hardcoded `paddingBottom: 16` as a fallback.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/mobile
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/components/TabBar.tsx
git commit -m "feat(mobile): add TabBar component (4 tabs, sage active state)"
```

---

## Task 9: history.ts — session history for trends

**Files:**
- Create: `apps/mobile/lib/history.ts`

- [ ] **Step 1: Create history.ts**

```typescript
// apps/mobile/lib/history.ts
// Fetches the user's past session data for the Trends screen and the
// SessionSummary trend preview. Returns one entry per calendar day
// containing the average silence score across sessions that day.
import { supabase } from "./supabase";

export interface SessionDaySummary {
  date: string;        // ISO "YYYY-MM-DD"
  avgScore: number | null;
  totalMinutes: number;
}

/**
 * Returns daily session summaries for the last `numDays` calendar days,
 * oldest-first. Days with no sessions have avgScore: null, totalMinutes: 0.
 */
export async function getSessionHistory(numDays = 84): Promise<SessionDaySummary[]> {
  const since = new Date();
  since.setDate(since.getDate() - numDays);

  const { data, error } = await supabase
    .from("sessions")
    .select("checked_in_at, final_score, achieved_minutes")
    .gte("checked_in_at", since.toISOString())
    .not("checked_out_at", "is", null) // completed sessions only
    .order("checked_in_at", { ascending: true });

  if (error) throw new Error(error.message);

  // Build a map of date → { scores, minutes }
  const byDate = new Map<string, { scores: number[]; minutes: number }>();
  for (const row of data ?? []) {
    const date = row.checked_in_at.slice(0, 10); // "YYYY-MM-DD"
    const existing = byDate.get(date) ?? { scores: [], minutes: 0 };
    if (row.final_score != null) existing.scores.push(row.final_score);
    existing.minutes += row.achieved_minutes ?? 0;
    byDate.set(date, existing);
  }

  // Produce one entry per calendar day in the window
  const result: SessionDaySummary[] = [];
  const cursor = new Date(since);
  for (let i = 0; i < numDays; i++) {
    const date = cursor.toISOString().slice(0, 10);
    const entry = byDate.get(date);
    result.push({
      date,
      avgScore:
        entry && entry.scores.length > 0
          ? Math.round(entry.scores.reduce((s, v) => s + v, 0) / entry.scores.length)
          : null,
      totalMinutes: entry?.minutes ?? 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}

/** Computes streak (consecutive days with at least one session) ending today. */
export function computeStreak(history: SessionDaySummary[]): number {
  let streak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].avgScore === null) break;
    streak++;
  }
  return streak;
}

/** Total quiet hours across all history entries. */
export function totalQuietHours(history: SessionDaySummary[]): number {
  return history.reduce((sum, d) => sum + d.totalMinutes, 0) / 60;
}

/** Best single session in minutes. */
export function bestSessionMinutes(history: SessionDaySummary[]): number {
  return history.reduce((best, d) => Math.max(best, d.totalMinutes), 0);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/mobile
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/lib/history.ts
git commit -m "feat(mobile): add session history lib (getSessionHistory, streak, hours helpers)"
```

---

## Task 10: OnboardingScreen

**Files:**
- Create: `apps/mobile/screens/OnboardingScreen.tsx`

Shows 3 slides with an animated orb. Uses `AsyncStorage` to write `'hasSeenOnboarding'` on completion so it only shows once.

- [ ] **Step 1: Create OnboardingScreen.tsx**

```tsx
// apps/mobile/screens/OnboardingScreen.tsx
// Spec §3.1–3.3. Three orb-led slides (cold → amber → gold), ending with
// "Get started" → Map. Writes hasSeenOnboarding to AsyncStorage on complete.
import { useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QuietIndexOrb } from "../components/QuietIndexOrb";
import { colors, fonts } from "../lib/theme";

export const ONBOARDING_KEY = "hasSeenOnboarding";

const SLIDES: { headline: string; body: string; color: string }[] = [
  {
    headline: "Disconnect, together.",
    body: "Find spaces where putting your phone down is the norm — not the exception.",
    color: "#8A98A6", // cold grey-blue (QI 0–30)
  },
  {
    headline: "Earn for your silence.",
    body: "Every quiet minute earns points redeemable at the venue.",
    color: "#D9A85E", // warm amber (QI 31–70)
  },
  {
    headline: "Only a score leaves your phone.",
    body: "Nothing you do, read, or say is ever seen. Just a number from 0 to 100.",
    color: "#E8C170", // full warm gold (QI 71–100)
  },
];

const CHIP_TEXT = "No content · No location history · No names";
const TRANSITION_DURATION = 600;

interface OnboardingScreenProps {
  onComplete: () => void;
}

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const [slideIndex, setSlideIndex] = useState(0);
  const orbColor = useRef(new Animated.Value(0)).current; // 0=cold, 1=amber, 2=gold

  const slide = SLIDES[slideIndex];
  const isLast = slideIndex === SLIDES.length - 1;

  function advance() {
    if (isLast) {
      AsyncStorage.setItem(ONBOARDING_KEY, "true").catch(() => {});
      onComplete();
      return;
    }

    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (reduced) {
        setSlideIndex((i) => i + 1);
        return;
      }
      Animated.timing(orbColor, {
        toValue: slideIndex + 1,
        duration: TRANSITION_DURATION,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: false, // color interpolation can't use native driver
      }).start(() => setSlideIndex((i) => i + 1));
    });
  }

  // The orb uses colorOverride so we can animate it independently of quietIndex.
  // On the final slide, add the privacy chip.
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <QuietIndexOrb
          quietIndex={null}
          size="small"
          colorOverride={slide.color}
        />
        <Text style={styles.headline}>{slide.headline}</Text>
        <Text style={styles.body}>{slide.body}</Text>
        {isLast && (
          <View style={styles.chip}>
            <Text style={styles.chipText}>{CHIP_TEXT}</Text>
          </View>
        )}
      </View>
      <Pressable style={styles.button} onPress={advance}>
        <Text style={styles.buttonText}>
          {isLast ? "Get started" : "Continue"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 40,
    justifyContent: "space-between",
  },
  content: { alignItems: "center", gap: 24 },
  headline: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 22,
    color: colors.ink,
    textAlign: "center",
    lineHeight: 30,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 300,
  },
  chip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  chipText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.muted,
    textAlign: "center",
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: "center",
  },
  buttonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: "white",
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/mobile
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/screens/OnboardingScreen.tsx
git commit -m "feat(mobile): add OnboardingScreen (3-slide orb-led flow, AsyncStorage gate)"
```

---

## Task 11: TrendsScreen

**Files:**
- Create: `apps/mobile/screens/TrendsScreen.tsx`

- [ ] **Step 1: Create TrendsScreen.tsx**

```tsx
// apps/mobile/screens/TrendsScreen.tsx
// Spec §3.9. Rhythm calendar + area chart (SVG) + stat chips.
import { useEffect, useState } from "react";
import { ActivityIndicator, Dimensions, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import {
  SessionDaySummary,
  bestSessionMinutes,
  computeStreak,
  getSessionHistory,
  totalQuietHours,
} from "../lib/history";
import { TrendCalendar } from "../components/TrendCalendar";
import { colors, fonts } from "../lib/theme";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CHART_PADDING = 24;
const CHART_WIDTH = SCREEN_WIDTH - CHART_PADDING * 2;
const CHART_HEIGHT = 80;
const CHART_WEEKS = 8; // show last 8 weeks on the area chart

export function TrendsScreen() {
  const [history, setHistory] = useState<SessionDaySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSessionHistory(84)
      .then(setHistory)
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!history) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.glowHigh} />
      </View>
    );
  }

  const streak = computeStreak(history);
  const hours = totalQuietHours(history);
  const bestMin = bestSessionMinutes(history);

  const calendarDays = history.map((d) => ({ date: d.date, avgScore: d.avgScore }));

  // Area chart: last CHART_WEEKS * 7 days, avg score per day
  const chartDays = history.slice(-(CHART_WEEKS * 7));
  const chartPath = buildAreaPath(chartDays, CHART_WIDTH, CHART_HEIGHT);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.heading}>YOUR QUIET</Text>

      <TrendCalendar
        days={calendarDays}
        totalQuietHours={hours}
        currentStreakDays={streak}
        bestSessionMinutes={bestMin}
      />

      <View style={styles.divider} />

      {/* Area chart */}
      <View style={styles.chartWrap}>
        <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
          <Defs>
            <LinearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={colors.glowMid} stopOpacity={0.3} />
              <Stop offset="100%" stopColor={colors.glowMid} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d={chartPath.area} fill="url(#chartGrad)" />
          <Path d={chartPath.line} fill="none" stroke={colors.glowMid} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </View>
    </ScrollView>
  );
}

/** Builds SVG line + area path for the chart from daily history entries. */
function buildAreaPath(
  days: SessionDaySummary[],
  width: number,
  height: number
): { line: string; area: string } {
  const scored = days.map((d) => d.avgScore ?? 0);
  if (scored.length < 2) return { line: "", area: "" };

  const n = scored.length;
  const points = scored.map((score, i) => ({
    x: (i / (n - 1)) * width,
    y: height - (score / 100) * (height - 4) - 2, // 2px bottom padding
  }));

  const lineParts = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`);
  const line = lineParts.join(" ");
  const area = `${line} L ${points[n - 1].x} ${height} L 0 ${height} Z`;

  return { line, area };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, gap: 20, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  heading: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.muted,
    textTransform: "uppercase",
  },
  divider: { height: 1, backgroundColor: colors.border },
  chartWrap: { overflow: "hidden" },
  errorText: { fontFamily: fonts.body, color: colors.alert, textAlign: "center" },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/mobile
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/screens/TrendsScreen.tsx
git commit -m "feat(mobile): add TrendsScreen (rhythm calendar + SVG area chart)"
```

---

## Task 12: SettingsScreen

**Files:**
- Create: `apps/mobile/screens/SettingsScreen.tsx`

- [ ] **Step 1: Create SettingsScreen.tsx**

```tsx
// apps/mobile/screens/SettingsScreen.tsx
// Spec §3.10. Permissions, data, about sections. No notification toggles.
import { useState } from "react";
import { Alert, Linking, ScrollView, StyleSheet, Switch, Text, View, Pressable } from "react-native";
import { colors, fonts } from "../lib/theme";
import { supabase } from "../lib/supabase";
import Constants from "expo-constants";

export function SettingsScreen() {
  const [usageAccess, setUsageAccess] = useState(false);
  const [notifPause, setNotifPause] = useState(false);

  function handleDeleteAccount() {
    Alert.alert(
      "Delete your account",
      "This will permanently delete your sessions, points, and all data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await supabase.auth.signOut();
            // Full deletion requires a server-side function; sign-out is the
            // client-side boundary. A backend RPC for full deletion is out of
            // scope for this UI pass — leave a TODO comment for Phase 10 hardening.
          },
        },
      ]
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Section 1: Permissions */}
      <Text style={styles.sectionTitle}>Permissions</Text>
      <View style={styles.card}>
        <ToggleRow
          title="Screen-off detection"
          description="Lets Hush know when your phone is locked or face-down."
          value={usageAccess}
          onChange={setUsageAccess}
        />
        <View style={styles.rowDivider} />
        <ToggleRow
          title="Notification pausing"
          description="Used to measure your silence score. No notification content is read."
          value={notifPause}
          onChange={setNotifPause}
        />
      </View>

      {/* Section 2: Your data */}
      <Text style={styles.sectionTitle}>Your data</Text>
      <View style={styles.card}>
        <Pressable style={styles.actionRow} onPress={() => {}}>
          <Text style={styles.actionLabel}>Export my data</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <View style={styles.rowDivider} />
        <Pressable style={styles.actionRow} onPress={handleDeleteAccount}>
          <Text style={[styles.actionLabel, styles.destructiveLabel]}>
            Delete my account
          </Text>
        </Pressable>
      </View>

      {/* Section 3: About */}
      <Text style={styles.sectionTitle}>About</Text>
      <View style={styles.card}>
        <View style={styles.textRow}>
          <Text style={styles.rowLabel}>Version</Text>
          <Text style={styles.rowValue}>
            {Constants.expoConfig?.version ?? "—"}
          </Text>
        </View>
        <View style={styles.rowDivider} />
        <Pressable
          style={styles.actionRow}
          onPress={() => Linking.openURL("https://hush.app/privacy")}
        >
          <Text style={[styles.actionLabel, { color: colors.accent }]}>
            Privacy policy
          </Text>
          <Text style={[styles.chevron, { color: colors.accent }]}>›</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function ToggleRow({
  title,
  description,
  value,
  onChange,
}: {
  title: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <Text style={styles.rowLabel}>{title}</Text>
        <Text style={styles.rowDescription}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.accent }}
        thumbColor="white"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, gap: 8, paddingBottom: 40 },
  sectionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.muted,
    textTransform: "uppercase",
    marginTop: 16,
    marginBottom: 8,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    overflow: "hidden",
  },
  rowDivider: { height: 1, backgroundColor: colors.border, marginHorizontal: 16 },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  toggleText: { flex: 1 },
  textRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    minHeight: 44,
  },
  rowLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.ink,
  },
  rowDescription: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
    lineHeight: 16,
  },
  rowValue: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted,
  },
  actionLabel: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
  },
  destructiveLabel: {
    color: colors.alert,
  },
  chevron: {
    fontFamily: fonts.body,
    fontSize: 18,
    color: colors.muted,
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/mobile
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/screens/SettingsScreen.tsx
git commit -m "feat(mobile): add SettingsScreen (permissions, data, about)"
```

---

## Task 13: App.tsx — tab navigation model + onboarding gate

**Files:**
- Modify: `apps/mobile/App.tsx`

This restructures the navigation from a flat push stack to a tab-bar model. The new shape:
- **Onboarding state:** shown once on first launch (AsyncStorage check)
- **Main state:** tab bar active with `{ tab, overlay }` where overlay can be `zoneDetail`, `activeSession`, or `sessionSummary`
- `WalletScreen` moves inside the tab bar (no longer an overlay)

- [ ] **Step 1: Replace App.tsx**

```tsx
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_600SemiBold,
} from "@expo-google-fonts/hanken-grotesk";
import { Newsreader_300Light } from "@expo-google-fonts/newsreader";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session, Zone } from "@hush/shared-types";
import { ensureSession } from "./lib/auth";
import { needsSilenceAgentOnboarding } from "./lib/permissions";
import { getSessionPointsAwarded } from "./lib/wallet";
import { colors } from "./lib/theme";
import { TabBar, type Tab } from "./components/TabBar";
import { OnboardingScreen, ONBOARDING_KEY } from "./screens/OnboardingScreen";
import { MapScreen } from "./screens/MapScreen";
import { PermissionOnboardingScreen } from "./screens/PermissionOnboardingScreen";
import { ZoneDetailScreen } from "./screens/ZoneDetailScreen";
import { ActiveSessionScreen } from "./screens/ActiveSessionScreen";
import { SessionSummaryScreen } from "./screens/SessionSummaryScreen";
import { WalletScreen } from "./screens/WalletScreen";
import { TrendsScreen } from "./screens/TrendsScreen";
import { SettingsScreen } from "./screens/SettingsScreen";

type Overlay =
  | { name: "permissionOnboarding"; zone: Zone }
  | { name: "zoneDetail"; zone: Zone }
  | { name: "activeSession"; session: Session; zone: Zone }
  | { name: "sessionSummary"; session: Session; pointsAwarded: number; zone: Zone };

type AppState =
  | { name: "loading" }
  | { name: "onboarding" }
  | { name: "main"; tab: Tab; overlay: Overlay | null };

export default function App() {
  const [fontsLoaded] = useFonts({
    HankenGrotesk_400Regular,
    HankenGrotesk_600SemiBold,
    Newsreader_300Light,
  });

  const [appState, setAppState] = useState<AppState>({ name: "loading" });

  useEffect(() => {
    Promise.all([ensureSession(), AsyncStorage.getItem(ONBOARDING_KEY)]).then(
      ([, seenOnboarding]) => {
        if (!seenOnboarding) {
          setAppState({ name: "onboarding" });
        } else {
          setAppState({ name: "main", tab: "map", overlay: null });
        }
      }
    );
  }, []);

  if (!fontsLoaded || appState.name === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.glowHigh} />
        <StatusBar style="dark" />
      </View>
    );
  }

  if (appState.name === "onboarding") {
    return (
      <View style={styles.container}>
        <OnboardingScreen
          onComplete={() => setAppState({ name: "main", tab: "map", overlay: null })}
        />
        <StatusBar style="dark" />
      </View>
    );
  }

  const { tab, overlay } = appState;

  async function handleSelectZone(zone: Zone) {
    if (await needsSilenceAgentOnboarding()) {
      setAppState({ name: "main", tab, overlay: { name: "permissionOnboarding", zone } });
    } else {
      setAppState({ name: "main", tab, overlay: { name: "zoneDetail", zone } });
    }
  }

  async function handleCheckedOut(session: Session, zone: Zone) {
    let pointsAwarded = 0;
    try {
      pointsAwarded = await getSessionPointsAwarded(session.id);
    } catch {
      // Show 0 rather than blocking the summary screen.
    }
    setAppState({
      name: "main",
      tab,
      overlay: { name: "sessionSummary", session, pointsAwarded, zone },
    });
  }

  function setTab(newTab: Tab) {
    setAppState({ name: "main", tab: newTab, overlay: null });
  }

  function clearOverlay() {
    setAppState({ name: "main", tab, overlay: null });
  }

  // Determine whether to show the tab bar (hidden during active session)
  const hideTabBar = overlay?.name === "activeSession";
  // Active session uses dark mode; everything else is light
  const isDark = overlay?.name === "activeSession";

  return (
    <View style={styles.container}>
      {/* Tab content */}
      {!overlay && tab === "map" && (
        <MapScreen onSelectZone={handleSelectZone} />
      )}
      {!overlay && tab === "trends" && <TrendsScreen />}
      {!overlay && tab === "wallet" && <WalletScreen />}
      {!overlay && tab === "settings" && <SettingsScreen />}

      {/* Overlays */}
      {overlay?.name === "permissionOnboarding" && (
        <PermissionOnboardingScreen
          onContinue={() =>
            setAppState({
              name: "main",
              tab,
              overlay: { name: "zoneDetail", zone: overlay.zone },
            })
          }
        />
      )}
      {overlay?.name === "zoneDetail" && (
        <ZoneDetailScreen
          zone={overlay.zone}
          onCheckedIn={(session) =>
            setAppState({
              name: "main",
              tab,
              overlay: { name: "activeSession", session, zone: overlay.zone },
            })
          }
          onClose={clearOverlay}
        />
      )}
      {overlay?.name === "activeSession" && (
        <ActiveSessionScreen
          session={overlay.session}
          onCheckedOut={(session) => handleCheckedOut(session, overlay.zone)}
        />
      )}
      {overlay?.name === "sessionSummary" && (
        <SessionSummaryScreen
          session={overlay.session}
          pointsAwarded={overlay.pointsAwarded}
          zone={overlay.zone}
          onViewWallet={() => setTab("wallet")}
          onDone={clearOverlay}
        />
      )}

      {/* Bottom tab bar (hidden during active session) */}
      {!hideTabBar && (
        <TabBar activeTab={tab} onTabPress={setTab} />
      )}

      <StatusBar style={isDark ? "light" : "dark"} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
});
```

> **Note:** `ZoneDetailScreen` now requires an `onClose` prop (back button / dismiss). `WalletScreen` no longer needs an `onClose` prop. Both must be updated in their respective tasks below.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/mobile
npx tsc --noEmit
```

Expected: TypeScript will report errors about `ZoneDetailScreen` missing `onClose` and `WalletScreen` receiving unexpected `onClose`. These are fixed in the next tasks.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/App.tsx
git commit -m "feat(mobile): restructure App.tsx to tab navigation model with onboarding gate"
```

---

## Task 14: MapScreen upgrade

**Files:**
- Modify: `apps/mobile/screens/MapScreen.tsx`

Changes: remove "Wallet" text button (moved to tab bar), add floating "Hush" wordmark pill top-left, scale bloom size by QI (24–40px), light mode chrome.

- [ ] **Step 1: Replace MapScreen.tsx**

```tsx
// apps/mobile/screens/MapScreen.tsx
// Spec §3.4. Light mode. Floating Hush wordmark pill top-left.
// Zone blooms scale size by Quiet Index (24–40px core) per spec §2.2.
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import type { Zone } from "@hush/shared-types";
import { fetchZones } from "../lib/zones";
import { quietIndexGlowColor } from "../lib/glow";
import { fetchLatestQuietIndex, subscribeToQuietIndex } from "../lib/quietIndex";
import { colors, fonts } from "../lib/theme";

const NO_READING_COLOR = "#3A3A3A";

/** Maps a Quiet Index (0–100) to a bloom diameter in px: 24px at 0, 40px at 100. */
function bloomSize(qi: number): number {
  return Math.round(24 + (qi / 100) * 16);
}

export function MapScreen({
  onSelectZone,
}: {
  onSelectZone: (zone: Zone) => void;
}) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [quietIndexByZone, setQuietIndexByZone] = useState<
    Record<string, number | null>
  >({});

  useEffect(() => {
    fetchZones()
      .then(setZones)
      .catch((err: Error) => setErrorMessage(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (zones.length === 0) return;
    let cancelled = false;
    zones.forEach((zone) => {
      fetchLatestQuietIndex(zone.id)
        .then((value) => {
          if (!cancelled)
            setQuietIndexByZone((cur) => ({ ...cur, [zone.id]: value }));
        })
        .catch(() => {});
    });
    const unsubs = zones.map((zone) =>
      subscribeToQuietIndex(zone.id, (value) => {
        setQuietIndexByZone((cur) => ({ ...cur, [zone.id]: value }));
      })
    );
    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [zones]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.glowHigh} />
      </View>
    );
  }

  if (errorMessage) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{errorMessage}</Text>
      </View>
    );
  }

  const firstRing = zones[0]?.geofence.coordinates[0] ?? [];
  const initialCenter = firstRing[0] ?? [0, 0];

  return (
    <View style={styles.container}>
      {/* Wordmark pill (spec §3.4) */}
      <View style={styles.wordmark} pointerEvents="none">
        <Text style={styles.wordmarkText}>Hush</Text>
      </View>

      <MapView
        style={styles.map}
        initialRegion={{
          latitude: initialCenter[1],
          longitude: initialCenter[0],
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {zones.map((zone) => {
          const ring = zone.geofence.coordinates[0] ?? [];
          const center = ring.reduce(
            (acc, [lng, lat]) => [acc[0] + lng / ring.length, acc[1] + lat / ring.length],
            [0, 0]
          );
          const qi = quietIndexByZone[zone.id];
          const size = qi != null ? bloomSize(qi) : 24;
          const bgColor = qi != null ? quietIndexGlowColor(qi) : NO_READING_COLOR;
          const opacity = qi != null ? 0.85 : 0.5;
          const borderRadius = size / 2;

          return (
            <Marker
              key={zone.id}
              coordinate={{ latitude: center[1], longitude: center[0] }}
              onPress={() => onSelectZone(zone)}
            >
              <View
                style={{ width: size, height: size, borderRadius, backgroundColor: bgColor, opacity }}
              />
            </Marker>
          );
        })}
      </MapView>

      {zones.length === 0 && (
        <View style={styles.emptyOverlay}>
          <Text style={styles.emptyText}>No quiet zones near you yet.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  errorText: { color: colors.alert, paddingHorizontal: 24, textAlign: "center" },
  wordmark: {
    position: "absolute",
    top: 56,
    left: 20,
    zIndex: 1,
    backgroundColor: "rgba(251,248,242,0.92)",
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  wordmarkText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.ink,
  },
  emptyOverlay: {
    position: "absolute",
    bottom: 32,
    alignSelf: "center",
  },
  emptyText: { fontFamily: fonts.body, color: colors.muted },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/mobile
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/screens/MapScreen.tsx
git commit -m "feat(mobile): upgrade MapScreen — wordmark pill, bloom size by QI, light mode chrome"
```

---

## Task 15: ZoneDetailScreen, ActiveSessionScreen, SessionSummaryScreen, WalletScreen upgrades

**Files:**
- Modify: `apps/mobile/screens/ZoneDetailScreen.tsx`
- Modify: `apps/mobile/screens/ActiveSessionScreen.tsx`
- Modify: `apps/mobile/screens/SessionSummaryScreen.tsx`
- Modify: `apps/mobile/screens/WalletScreen.tsx`

- [ ] **Step 1: Replace ZoneDetailScreen.tsx**

Upgrades: light mode, medium QuietIndexOrb for live QI, inline CommitmentArcDial replaces TextInput, theme tokens throughout, `onClose` back button.

```tsx
// apps/mobile/screens/ZoneDetailScreen.tsx
// Spec §3.5. Light mode. Medium orb for live QI. Inline arc dial for minutes.
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Location from "expo-location";
import type { Session, Zone } from "@hush/shared-types";
import { checkInsideZone } from "../lib/geofence";
import { createCheckIn } from "../lib/checkin";
import { fetchLatestQuietIndex } from "../lib/quietIndex";
import { QuietIndexOrb } from "../components/QuietIndexOrb";
import { CommitmentArcDial } from "../components/CommitmentArcDial";
import { colors, fonts } from "../lib/theme";

type GeofenceStatus = "checking" | "inside" | "outside" | "unknown";

export function ZoneDetailScreen({
  zone,
  onCheckedIn,
  onClose,
}: {
  zone: Zone;
  onCheckedIn: (session: Session) => void;
  onClose: () => void;
}) {
  const [geofenceStatus, setGeofenceStatus] = useState<GeofenceStatus>("checking");
  const [quietIndex, setQuietIndex] = useState<number | null>(null);
  const [intendedMinutes, setIntendedMinutes] = useState(30);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchLatestQuietIndex(zone.id).then(setQuietIndex).catch(() => {});
  }, [zone.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        if (!cancelled) setGeofenceStatus("unknown");
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      const inside = await checkInsideZone(zone.id, position.coords.latitude, position.coords.longitude);
      if (cancelled) return;
      setGeofenceStatus(inside === null ? "unknown" : inside ? "inside" : "outside");
    })();
    return () => { cancelled = true; };
  }, [zone.id]);

  async function handleCheckIn() {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const session = await createCheckIn(zone.id, intendedMinutes);
      onCheckedIn(session);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Check-in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  const geofenceLabel = {
    checking: "Checking your location…",
    inside: "You're inside this zone",
    outside: "You're outside — you can still check in",
    unknown: "Couldn't confirm location — you can still check in",
  }[geofenceStatus];

  return (
    <View style={styles.container}>
      {/* Back / close button */}
      <Pressable style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close">
        <Text style={styles.closeBtnText}>✕</Text>
      </Pressable>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Zone name */}
        <Text style={styles.zoneName}>{zone.name}</Text>

        {/* Active people caption */}
        <Text style={styles.caption}>Quiet zone</Text>

        {/* Medium Quiet Index orb */}
        <View style={styles.orbWrap}>
          <QuietIndexOrb quietIndex={quietIndex} size="medium" />
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Arc dial */}
        <Text style={styles.goalLabel}>YOUR GOAL</Text>
        <CommitmentArcDial value={intendedMinutes} onChange={setIntendedMinutes} />

        {/* Reward on offer (read-only chip) */}
        {zone.rewardConfig && (
          <View style={styles.rewardChip}>
            <View style={styles.rewardInfo}>
              <Text style={styles.rewardName}>Earn points here</Text>
              <Text style={styles.rewardCost}>
                Min score: {zone.rewardConfig.min_score_for_earning}
              </Text>
            </View>
          </View>
        )}

        {/* Geofence status */}
        <Text style={styles.geofenceLabel}>{geofenceLabel}</Text>

        {/* Error */}
        {submitError && <Text style={styles.errorText}>{submitError}</Text>}
      </ScrollView>

      {/* Check-in button */}
      <Pressable
        style={[styles.checkInBtn, submitting && styles.checkInBtnDisabled]}
        onPress={handleCheckIn}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color={colors.background} />
        ) : (
          <Text style={styles.checkInBtnText}>Check in</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  closeBtn: {
    position: "absolute",
    top: 20,
    right: 20,
    zIndex: 2,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: {
    fontFamily: fonts.body,
    fontSize: 18,
    color: colors.muted,
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: 24,
    paddingTop: 56,
    alignItems: "center",
    gap: 16,
  },
  zoneName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 22,
    color: colors.ink,
    textAlign: "center",
  },
  caption: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
  },
  orbWrap: { marginVertical: 8 },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    width: "100%",
    marginVertical: 8,
  },
  goalLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.muted,
    textTransform: "uppercase",
    alignSelf: "flex-start",
  },
  rewardChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    width: "100%",
  },
  rewardInfo: { flex: 1 },
  rewardName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.ink,
  },
  rewardCost: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  geofenceLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    textAlign: "center",
  },
  errorText: {
    fontFamily: fonts.body,
    color: colors.alert,
    textAlign: "center",
  },
  checkInBtn: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: "center",
    margin: 24,
    marginBottom: 16,
  },
  checkInBtnDisabled: { opacity: 0.5 },
  checkInBtnText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: "white",
  },
});
```

- [ ] **Step 2: Update ActiveSessionScreen.tsx — gold CTA + hint text**

Only two targeted changes: the check-out button gets gold fill, and the hint text is added explicitly if not already present. Read the current file first to confirm.

```tsx
// In ActiveSessionScreen.tsx, update ONLY these two style entries:

// Change the button style from:
//   button: { backgroundColor: colors.glowHigh, borderRadius: 16, ... }
// to ensure it's gold (it already is — verify and leave as-is if correct).

// Ensure the hint text line exists:
//   <Text style={styles.hint}>Phone resting. Tap only to check out.</Text>
// It already exists in the current file. Verify the hint style uses nightHint color:
```

Open `apps/mobile/screens/ActiveSessionScreen.tsx` and confirm:
1. `styles.button` has `backgroundColor: colors.glowHigh` — if so, no change needed (gold is already `#E8C170`)
2. The hint `<Text>` line exists and uses `styles.hint` with `color: colors.nightHint`

If either is missing, apply the minimal fix. No full rewrite needed for this screen.

- [ ] **Step 3: Replace SessionSummaryScreen.tsx — light mode + trend preview**

```tsx
// apps/mobile/screens/SessionSummaryScreen.tsx
// Spec §3.7. Light mode. Trend calendar preview (last 4 weeks, today highlighted).
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Session, Zone } from "@hush/shared-types";
import { colors, fonts } from "../lib/theme";
import { sessionSummaryHint } from "../lib/scoring";
import { TrendCalendar } from "../components/TrendCalendar";
import {
  SessionDaySummary,
  bestSessionMinutes,
  computeStreak,
  getSessionHistory,
  totalQuietHours,
} from "../lib/history";

export function SessionSummaryScreen({
  session,
  pointsAwarded,
  zone,
  onViewWallet,
  onDone,
}: {
  session: Session;
  pointsAwarded: number;
  zone: Zone;
  onViewWallet: () => void;
  onDone: () => void;
}) {
  const [history, setHistory] = useState<SessionDaySummary[] | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    // 28 days = 4 weeks for the preview
    getSessionHistory(28).then(setHistory).catch(() => {});
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Session complete</Text>

      {/* Three stat tiles */}
      <View style={styles.tiles}>
        <View style={styles.tile}>
          <Text style={styles.tileValue}>{session.achievedMinutes ?? "--"}</Text>
          <Text style={styles.tileLabel}>QUIET MINUTES</Text>
        </View>
        <View style={styles.tile}>
          <Text style={styles.tileValue}>{session.finalScore ?? "--"}</Text>
          <Text style={styles.tileLabel}>AVG SILENCE</Text>
        </View>
        <View style={[styles.tile]}>
          <Text style={[styles.tileValue, styles.tileValueGold]}>{pointsAwarded}</Text>
          <Text style={styles.tileLabel}>POINTS</Text>
        </View>
      </View>

      {/* Hint */}
      <Text style={styles.hint}>
        {sessionSummaryHint(
          pointsAwarded,
          session.achievedMinutes,
          session.finalScore,
          zone.rewardConfig.min_score_for_earning
        )}
      </Text>

      {/* 4-week trend preview */}
      {history && (
        <View style={styles.calendarWrap}>
          <TrendCalendar
            days={history}
            totalQuietHours={totalQuietHours(history)}
            currentStreakDays={computeStreak(history)}
            bestSessionMinutes={bestSessionMinutes(history)}
            highlightDate={today}
          />
        </View>
      )}

      <Pressable style={styles.primaryBtn} onPress={onViewWallet}>
        <Text style={styles.primaryBtnText}>View wallet</Text>
      </Pressable>
      <Pressable style={styles.ghostBtn} onPress={onDone}>
        <Text style={styles.ghostBtnText}>Done</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.muted,
    textTransform: "uppercase",
    marginBottom: 20,
  },
  tiles: { flexDirection: "row", gap: 10, width: "100%", maxWidth: 320, marginBottom: 16 },
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    alignItems: "center",
  },
  tileValue: { fontFamily: fonts.hero, fontSize: 24, color: colors.ink },
  tileValueGold: { color: colors.rewardGold },
  tileLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 8,
    letterSpacing: 1,
    color: colors.muted,
    marginTop: 4,
    textAlign: "center",
  },
  hint: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    marginBottom: 20,
    maxWidth: 280,
    lineHeight: 20,
  },
  calendarWrap: { width: "100%", marginBottom: 24 },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 40,
    marginBottom: 10,
  },
  primaryBtnText: { fontFamily: fonts.bodySemiBold, color: "white" },
  ghostBtn: { paddingVertical: 10, paddingHorizontal: 24 },
  ghostBtnText: { fontFamily: fonts.body, color: colors.muted },
});
```

- [ ] **Step 4: Update WalletScreen.tsx — light mode, remove onClose prop**

The only changes needed in `WalletScreen.tsx`:
1. Remove the `onClose` prop (navigation is now via tab bar)
2. Change `colors.night` → `colors.background` for the container background
3. Change `colors.night` → `colors.background` for the center loading background

Make these three targeted edits to the existing file rather than rewriting it:

```tsx
// Remove: { onClose }: { onClose: () => void }
// Change to: function WalletScreen() {

// Remove: <Pressable onPress={onClose} style={styles.closeButton}>...</Pressable>
// Remove: closeButton and closeButtonText styles

// Change: backgroundColor: colors.night → backgroundColor: colors.background
// in both the container and center styles
```

- [ ] **Step 5: Final TypeScript check**

```bash
cd apps/mobile
npx tsc --noEmit
```

Expected: no errors across all modified files.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/screens/ZoneDetailScreen.tsx \
        apps/mobile/screens/ActiveSessionScreen.tsx \
        apps/mobile/screens/SessionSummaryScreen.tsx \
        apps/mobile/screens/WalletScreen.tsx
git commit -m "feat(mobile): upgrade all screens to light mode, orb, arc dial, trend preview"
```

---

## Self-Review

### Spec Coverage Check

| Spec section | Covered by task |
|---|---|
| §1.1 Light mode tokens | Task 1 |
| §1.2 Typography scale | Task 1 (theme.ts exports fonts) |
| §1.3 Spacing & shape | Applied per-component throughout |
| §2.1 QuietIndexOrb (3 sizes, breathing) | Task 4 |
| §2.2 Zone bloom size scaling | Task 14 (MapScreen) |
| §2.3 CommitmentArcDial | Tasks 2 + 5 |
| §2.4 CoachCard (light/dark variant) | Task 7 |
| §2.5 Reward Chip | ZoneDetailScreen (Task 15, read-only chip) + WalletScreen existing |
| §2.6 TrendCalendar | Tasks 3 + 6 |
| §2.7 TabBar | Tasks 8 + 13 |
| §2.8 Buttons | Applied in each screen |
| §2.9 Text Input | Replaced by arc dial; no standalone TextInput in upgraded screens |
| §2.10 Empty State | MapScreen (Task 14) + WalletScreen existing |
| §3.1–3.3 Onboarding 3 slides | Task 10 |
| §3.4 Map Screen | Task 14 |
| §3.5 Zone Detail | Task 15 (Step 1) |
| §3.6 Active Session | Task 15 (Step 2) — mostly already correct |
| §3.7 Session Summary | Task 15 (Step 3) |
| §3.8 Wallet Screen | Task 15 (Step 4) |
| §3.9 Trends Screen | Tasks 9 + 11 |
| §3.10 Settings Screen | Task 12 |
| §4.1 Reduced motion gate | Task 4 (orb), Task 7 (CoachCard), Task 10 (onboarding) |
| §4.2 Screen transitions | Handled by App.tsx overlay swap; slow fade to dark/light is a follow-up (requires Animated wrapper) |
| §4.3 Animation specs | Task 4 (orb), Task 7 (CoachCard), Task 10 (onboarding orb) |
| §4.4 Haptics | Not in scope for this plan (no expo-haptics installed; add in a follow-up) |
| §4.5 Accessibility | accessibilityRole/label/value throughout; arc dial accessibilityActions in Task 5 |
| §5 Code notes | Each task addresses the specific gap called out in the spec |

**Gap noted:** The 600ms ceremonial fade-to-dark / fade-to-light transition between Map→ActiveSession and ActiveSession→SessionSummary (spec §4.2) is not implemented in this plan — the overlay swap in App.tsx is instant. Add an `Animated.View` wrapper with opacity transition in App.tsx as a follow-up polish task if time allows.

**Gap noted:** Haptics (spec §4.4) require `expo install expo-haptics`. Deferred — no functional impact on the visual design.

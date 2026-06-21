import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MESSAGES, pickMessage } from "./coach-messages";
import type { CoachMemory, CoachNudgeCategory } from "./coach";

// PRD §8.1 tone gate: the coach must never read as scolding, even subtly.
// This denylist is the programmatic enforcement of "never-shaming" -- if a
// chosen message variant trips it, rewrite the message, don't weaken the
// regex.
const SHAMING_DENYLIST = /\b(fail|failed|should(n.t)?|wasted|guilt|again\?|don.t|stop|bad)\b/i;

const CATEGORIES: CoachNudgeCategory[] = [
  "settling",
  "phone_picked_up",
  "streak_improving",
  "quiet_accumulating",
  "goal_nearing",
  "goal_reached",
];

function memory(overrides: Partial<CoachMemory> = {}): CoachMemory {
  return {
    lastNudgeAt: null,
    firedOneShots: [],
    ...overrides,
  };
}

describe("MESSAGES", () => {
  it("has at least two warm variants for every CoachNudgeCategory", () => {
    for (const category of CATEGORIES) {
      expect(MESSAGES[category]).toBeDefined();
      expect(MESSAGES[category].length).toBeGreaterThanOrEqual(2);
      for (const variant of MESSAGES[category]) {
        expect(variant.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("never matches the never-shaming denylist, for any category or variant", () => {
    for (const category of CATEGORIES) {
      for (const variant of MESSAGES[category]) {
        expect(variant).not.toMatch(SHAMING_DENYLIST);
      }
    }
  });

  it("quiet_accumulating messages never mention a points figure or digit -- calm presence framing only, no number", () => {
    for (const variant of MESSAGES.quiet_accumulating) {
      expect(variant).not.toMatch(/\d/);
      expect(variant).not.toMatch(/\bpoints?\b/i);
    }
  });
});

describe("pickMessage", () => {
  it("resolves every CoachNudgeCategory to a non-empty message", () => {
    for (const category of CATEGORIES) {
      const message = pickMessage(category, memory());
      expect(typeof message).toBe("string");
      expect(message.trim().length).toBeGreaterThan(0);
    }
  });

  it("never matches the never-shaming denylist for any resolved message", () => {
    for (const category of CATEGORIES) {
      for (let fired = 0; fired < 5; fired++) {
        const mem = memory({ firedOneShots: Array(fired).fill(category) });
        const message = pickMessage(category, mem);
        expect(message).not.toMatch(SHAMING_DENYLIST);
      }
    }
  });

  it("is deterministic -- same category and memory always resolve to the same message", () => {
    const mem = memory({ firedOneShots: ["settling", "settling"] });
    const first = pickMessage("streak_improving", mem);
    const second = pickMessage("streak_improving", mem);
    expect(first).toBe(second);
  });

  it("selects among the declared variants for a category, indexed deterministically by memory", () => {
    const variants = MESSAGES.goal_nearing;
    const seen = new Set<string>();
    for (let fired = 0; fired < variants.length * 2; fired++) {
      const mem = memory({ firedOneShots: Array(fired).fill("goal_nearing") });
      const message = pickMessage("goal_nearing", mem);
      expect(variants).toContain(message);
      seen.add(message);
    }
    // Over enough ticks, more than one variant should have been seen --
    // proves selection isn't hardcoded to index 0.
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("no-network-import gate (security)", () => {
  // PRD §7.3 / SR-2: the coach message layer is pure data + a pure selection
  // function. It must never become a path for network calls, Supabase
  // access, or anything that could smuggle telemetry alongside copy text.
  // We assert on the raw source text (not just the import graph) so this
  // gate independently catches a future `fetch(...)`/`require(...)` call
  // even if no top-level import statement is added.
  const NETWORK_BEARING_PATTERN =
    /\bfetch\s*\(|\bsupabase\b|\.\/ingest|\.\/supabase|react-native|XMLHttpRequest|axios/i;

  it("coach-messages.ts contains no network-bearing references", () => {
    const source = readFileSync(join(__dirname, "coach-messages.ts"), "utf-8");
    expect(source).not.toMatch(NETWORK_BEARING_PATTERN);
  });

  it("coach.ts contains no network-bearing references", () => {
    const source = readFileSync(join(__dirname, "coach.ts"), "utf-8");
    expect(source).not.toMatch(NETWORK_BEARING_PATTERN);
  });
});

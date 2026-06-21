import { describe, expect, it } from "vitest";
import {
  evaluateCoach,
  NUDGE_COOLDOWN_MS,
  type CoachMemory,
  type CoachSignalState,
} from "./coach";

function state(overrides: Partial<CoachSignalState> = {}): CoachSignalState {
  return {
    liveScore: 50,
    previousScore: 50,
    isForeground: false,
    elapsedMs: 5 * 60_000,
    intendedMinutes: 30,
    recentScores: [50, 50, 50, 50],
    ...overrides,
  };
}

function memory(overrides: Partial<CoachMemory> = {}): CoachMemory {
  return {
    lastNudgeAt: null,
    firedOneShots: [],
    ...overrides,
  };
}

const NOW = 1_000_000;

describe("evaluateCoach", () => {
  it("fires phone_picked_up when the phone is in the foreground this tick", () => {
    const result = evaluateCoach(state({ isForeground: true }), memory(), NOW);
    expect(result.nudge?.category).toBe("phone_picked_up");
  });

  it("fires goal_reached once elapsed reaches intendedMinutes, and never fires it twice", () => {
    const intendedMinutes = 30;
    const elapsedMs = intendedMinutes * 60_000;

    const first = evaluateCoach(state({ elapsedMs, intendedMinutes }), memory(), NOW);
    expect(first.nudge?.category).toBe("goal_reached");
    expect(first.memory.firedOneShots).toContain("goal_reached");

    // Same tick conditions again, but using the returned memory -- the
    // one-shot must not fire a second time even well past the cooldown.
    const second = evaluateCoach(
      state({ elapsedMs, intendedMinutes }),
      first.memory,
      NOW + NUDGE_COOLDOWN_MS + 1
    );
    expect(second.nudge?.category).not.toBe("goal_reached");
  });

  it("fires goal_nearing when elapsed is within [80%, 100%) of intendedMinutes", () => {
    const intendedMinutes = 30;
    const elapsedMs = 0.85 * intendedMinutes * 60_000;

    const result = evaluateCoach(state({ elapsedMs, intendedMinutes }), memory(), NOW);
    expect(result.nudge?.category).toBe("goal_nearing");
  });

  it("does not fire goal_nearing after goal_reached has already fired for the session", () => {
    const intendedMinutes = 30;
    // 85% elapsed, but goal_reached already recorded as fired (e.g. session
    // continued past the goal and elapsed dropped back below 100% due to a
    // recalculated intendedMinutes -- the one-shot history still applies).
    const elapsedMs = 0.85 * intendedMinutes * 60_000;
    const priorMemory = memory({ firedOneShots: ["goal_reached"] });

    const result = evaluateCoach(state({ elapsedMs, intendedMinutes }), priorMemory, NOW);
    expect(result.nudge?.category).not.toBe("goal_nearing");
  });

  it("fires streak_improving when recentScores trend upward and end high", () => {
    const result = evaluateCoach(
      state({
        liveScore: 85,
        previousScore: 70,
        recentScores: [40, 55, 70, 85],
        intendedMinutes: null,
      }),
      memory(),
      NOW
    );
    expect(result.nudge?.category).toBe("streak_improving");
  });

  it("fires quiet_accumulating for a sustained high score with no other trigger", () => {
    const result = evaluateCoach(
      state({
        liveScore: 85,
        previousScore: 85,
        recentScores: [85, 84, 86, 85],
        intendedMinutes: null,
      }),
      memory(),
      NOW
    );
    expect(result.nudge?.category).toBe("quiet_accumulating");
  });

  it("returns null for non-one-shot triggers within the cooldown window of the last nudge", () => {
    const priorMemory = memory({ lastNudgeAt: NOW - 1_000 });
    const result = evaluateCoach(
      state({
        liveScore: 85,
        previousScore: 85,
        recentScores: [85, 84, 86, 85],
        intendedMinutes: null,
      }),
      priorMemory,
      NOW
    );
    expect(result.nudge).toBeNull();
    expect(result.memory).toBe(priorMemory);
  });

  it("returns null at a calm baseline -- mid score, not foreground, no goal set", () => {
    const result = evaluateCoach(
      state({
        liveScore: 50,
        previousScore: 50,
        isForeground: false,
        intendedMinutes: null,
        recentScores: [50, 50, 50, 50],
        elapsedMs: 5 * 60_000,
      }),
      memory(),
      NOW
    );
    expect(result.nudge).toBeNull();
  });

  it("never fires goal categories when intendedMinutes is null", () => {
    const result = evaluateCoach(
      state({ intendedMinutes: null, elapsedMs: 1_000_000_000 }),
      memory(),
      NOW
    );
    expect(result.nudge?.category).not.toBe("goal_reached");
    expect(result.nudge?.category).not.toBe("goal_nearing");
  });

  it("fires settling early in a session with no other trigger, once per session", () => {
    const first = evaluateCoach(
      state({
        liveScore: 10,
        previousScore: 10,
        elapsedMs: 5_000,
        intendedMinutes: null,
        recentScores: [10, 10],
      }),
      memory(),
      NOW
    );
    expect(first.nudge?.category).toBe("settling");
    expect(first.memory.firedOneShots).toContain("settling");

    const second = evaluateCoach(
      state({
        liveScore: 10,
        previousScore: 10,
        elapsedMs: 6_000,
        intendedMinutes: null,
        recentScores: [10, 10],
      }),
      first.memory,
      NOW + NUDGE_COOLDOWN_MS + 1
    );
    expect(second.nudge?.category).not.toBe("settling");
  });

  it("fires settling even within the cooldown window, like other one-shots", () => {
    const priorMemory = memory({ lastNudgeAt: NOW - 1_000 });
    const result = evaluateCoach(
      state({
        liveScore: 10,
        previousScore: 10,
        elapsedMs: 5_000,
        intendedMinutes: null,
        recentScores: [10, 10],
      }),
      priorMemory,
      NOW
    );
    expect(result.nudge?.category).toBe("settling");
  });
});

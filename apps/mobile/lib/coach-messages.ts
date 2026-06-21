// Message-text layer for the personal disconnection coach (PRD §8.1, U5).
// Pure data + a pure selection function only -- no network, no native
// calls, no rule logic. lib/coach.ts decides *which* category should fire
// this tick; this file decides *what copy* represents that category. The
// caller (Task 3's CoachCard, Task 4's wiring) renders the returned string.
//
// Two locked product decisions this file must honor:
//  - No cross-session baseline learning: messages are generic per category,
//    not personalized with remembered history (deferred to V1).
//  - quiet_accumulating is calm-presence / quiet-time feedback, never a
//    points figure -- "your quiet time is adding up", not "+5 points".
import { NUDGE_COOLDOWN_MS } from "./coach";
import type { CoachMemory, CoachNudgeCategory } from "./coach";

// 2-3 warm variants per category. Every variant must clear the
// never-shaming bar (PRD §8.1): encouraging, calm, never a guilt-trip for
// picking the phone up. See coach-messages.test.ts for the denylist that
// enforces this programmatically -- if a variant trips it, rewrite the
// message here, don't weaken the test.
export const MESSAGES: Record<CoachNudgeCategory, string[]> = {
  settling: [
    "Phone down. Take a breath.",
    "You're here now. Let the quiet settle in.",
    "Nice and easy. No rush to get anywhere.",
  ],
  phone_picked_up: [
    "Welcome back. The quiet's still here whenever you are.",
    "No need to explain. Whenever you're ready, it'll be waiting.",
    "Just checking in on yourself, maybe. The session's still going.",
  ],
  streak_improving: [
    "Settling deeper. This is the good part.",
    "You're easing further into it. Keep going at your own pace.",
    "Something's clicking. Let it carry you.",
  ],
  quiet_accumulating: [
    "Your quiet time is adding up. Nicely done.",
    "The stillness is building. Just let it happen.",
    "Calm is accumulating in the background. Nothing to do but be here.",
  ],
  goal_nearing: [
    "Almost at your goal — and no rush.",
    "Getting close now. Whatever pace feels right is the right one.",
    "You're nearly there. Enjoy the last stretch.",
  ],
  goal_reached: [
    "You're past your goal. Stay as long as it feels good.",
    "Goal met. The rest of this time is just a gift to yourself.",
    "You made it. Linger here if you'd like — there's no clock now.",
  ],
};

// Deterministic by design: tests (and any future UI snapshot) need a
// reproducible mapping from (category, now) to a single message, with no
// true randomness or hidden state. Rotation is keyed off `now` (bucketed by
// NUDGE_COOLDOWN_MS, the same cadence coach.ts already uses to gate how
// often a nudge can fire) rather than memory.firedOneShots.length: that
// counter only grows for the one-shot categories (settling, goal_nearing,
// goal_reached -- see ONE_SHOT_CATEGORIES in coach.ts), so for the three
// repeatable categories (phone_picked_up, streak_improving,
// quiet_accumulating) it would stay flat for the rest of the session,
// freezing every later nudge in that category onto the same fixed variant.
// Bucketing by time instead guarantees real rotation across a session for
// every category, repeatable or one-shot. `memory` is accepted but unused
// today; kept for a future personalized-copy hook (see the "no
// cross-session baseline learning" note above) without another signature
// change.
export function pickMessage(
  category: CoachNudgeCategory,
  memory: CoachMemory,
  now: number
): string {
  const variants = MESSAGES[category];
  const bucket = Math.floor(now / NUDGE_COOLDOWN_MS);
  const index = bucket % variants.length;
  return variants[index];
}

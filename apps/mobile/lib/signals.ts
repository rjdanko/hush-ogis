import { Platform } from "react-native";
import { getNativeSignals, type NativeSilenceSignals } from "../modules/silence-signals";
import type { SilenceSignals } from "./scoring";

// Android: read real OS signals from the native module (Task 6).
// iOS: PRD §7.2 documented limitation -- no equivalent OS APIs are reachable
// from a third-party app. Fall back to an honor-system timer that credits
// elapsed in-session time as if the screen had been off the whole time, with
// no DND/foreground signal (interruptionFilter stays at "ALL", isForeground
// stays false) -- a flat, generous degrade rather than scoring 0.
export async function getSilenceSignals(elapsedSessionMs: number): Promise<SilenceSignals> {
  if (Platform.OS !== "android") {
    return { screenOffMs: elapsedSessionMs, interruptionFilter: 1, isForeground: false };
  }
  const native: NativeSilenceSignals = await getNativeSignals();
  return native;
}

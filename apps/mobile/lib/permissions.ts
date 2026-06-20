import { Platform } from "react-native";
import { hasUsageAccessPermission } from "../modules/silence-signals";

// Whether the user needs to see the permission-onboarding screen (Design
// Brief Flow A.01d) before their first check-in starts the silence agent.
// Permissions are revocable, so this is re-checked every time, not cached.
export async function needsSilenceAgentOnboarding(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  const granted = await hasUsageAccessPermission();
  return !granted;
}

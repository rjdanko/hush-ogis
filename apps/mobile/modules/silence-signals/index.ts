import { requireNativeModule } from "expo-modules-core";

export interface NativeSilenceSignals {
  screenOffMs: number;
  interruptionFilter: number;
  isForeground: boolean;
}

interface SilenceSignalsNativeModule {
  getSignals(): Promise<NativeSilenceSignals>;
  hasUsageAccessPermission(): Promise<boolean>;
  openUsageAccessSettings(): void;
}

const MOCK_SIGNALS: NativeSilenceSignals = {
  screenOffMs: 0,
  interruptionFilter: 1,
  isForeground: true,
};

let NativeModule: SilenceSignalsNativeModule | null = null;
try {
  NativeModule = requireNativeModule<SilenceSignalsNativeModule>("SilenceSignals");
} catch {
  // Running in Expo Go — custom native module unavailable, use mock
}

export function getNativeSignals(): Promise<NativeSilenceSignals> {
  return NativeModule ? NativeModule.getSignals() : Promise.resolve(MOCK_SIGNALS);
}

export function hasUsageAccessPermission(): Promise<boolean> {
  return NativeModule ? NativeModule.hasUsageAccessPermission() : Promise.resolve(false);
}

export function openUsageAccessSettings(): void {
  NativeModule?.openUsageAccessSettings();
}

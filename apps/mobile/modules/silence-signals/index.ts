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

const NativeModule = requireNativeModule<SilenceSignalsNativeModule>("SilenceSignals");

export function getNativeSignals(): Promise<NativeSilenceSignals> {
  return NativeModule.getSignals();
}

export function hasUsageAccessPermission(): Promise<boolean> {
  return NativeModule.hasUsageAccessPermission();
}

export function openUsageAccessSettings(): void {
  NativeModule.openUsageAccessSettings();
}

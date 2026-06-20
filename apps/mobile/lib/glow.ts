// Quiet Index "glow" scale (Design Brief §3) -- the one place color carries
// meaning in the whole app. Three discrete bands, not a gradient: 0-30 cool
// grey-blue (noisy), 31-70 warm amber (medium), 71-100 full warm glow (quiet).
export function quietIndexGlowColor(quietIndex: number): string {
  const clamped = Math.max(0, Math.min(100, quietIndex));
  if (clamped <= 30) return "#8A98A6";
  if (clamped <= 70) return "#D9A85E";
  return "#E8C170";
}

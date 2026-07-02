// Pure math helpers for CommitmentArcDial. Angles are degrees clockwise from
// 12 o'clock. The arc spans 240° with the 120° gap centered at 6 o'clock.
// Start = 240° (8 o'clock), End = 240° + 240° = 480° ≡ 120° (4 o'clock).
// Gap: 120° → 240°, centered at 180° = 6 o'clock (bottom). ✓

export const ARC_START_ANGLE = 240; // degrees from 12 o'clock, clockwise — 8 o'clock
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
  // Angles in [0, ARC_START_ANGLE) that fall within the arc's upper segment
  // (the part that crossed 360°) need to be shifted up by 360 before mapping.
  let adjusted = angle;
  if (adjusted < ARC_START_ANGLE && adjusted + 360 <= ARC_START_ANGLE + ARC_SWEEP) {
    adjusted += 360;
  }
  let normalized = adjusted - ARC_START_ANGLE;
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

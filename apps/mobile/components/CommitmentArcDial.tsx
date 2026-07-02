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

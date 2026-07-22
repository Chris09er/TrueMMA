import { StyleSheet, Text, View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { fontFamily, useTheme } from '../../lib/theme';

// PLACEHOLDER brand mark until the final vector logo asset is supplied
// (see docs/DESIGN_HANDOFF.md "Open input required"). Draws the intended
// direction — a silver "T" inside a regular octagon with a cobalt inner
// contour — as vector, so it is not a shipped raster asset, but it is NOT
// the final mark and must not be exported as the app icon.
const OCTAGON: ReadonlyArray<readonly [number, number]> = [
  [0.293, 0], [0.707, 0], [1, 0.293], [1, 0.707],
  [0.707, 1], [0.293, 1], [0, 0.707], [0, 0.293],
];

export default function LogoPlaceholder({ size = 28 }: { size?: number }) {
  const { colors } = useTheme();
  const pad = size * 0.06;
  const inner = size - pad * 2;
  const points = OCTAGON.map(([x, y]) => `${pad + x * inner},${pad + y * inner}`).join(' ');
  return (
    <View
      style={{ width: size, height: size }}
      accessibilityLabel="True MMA (placeholder logo)"
    >
      <Svg width={size} height={size}>
        <Polygon points={points} fill="none" stroke={colors.accent} strokeWidth={Math.max(1.5, size * 0.06)} />
      </Svg>
      <Text
        style={[
          StyleSheet.absoluteFill,
          {
            textAlign: 'center',
            lineHeight: size,
            fontFamily: fontFamily.displayBold,
            fontSize: size * 0.5,
            color: colors.alloy,
          },
        ]}
      >
        T
      </Text>
    </View>
  );
}

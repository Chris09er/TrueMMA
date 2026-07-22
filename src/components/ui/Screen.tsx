import { type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/theme';

type Props = {
  children: ReactNode;
  /** Apply the top safe-area inset as padding (default true). */
  topInset?: boolean;
  /** Apply the bottom safe-area inset (default false — the tab bar handles it). */
  bottomInset?: boolean;
  style?: ViewStyle;
};

/**
 * Full-bleed screen wrapper: a diagonal Blue Alloy background gradient plus a
 * soft cobalt corner glow (top-right) for depth — the metallic navy look of
 * the design references. The glow is stronger in dark, faint in light.
 */
export default function Screen({ children, topInset = true, bottomInset = false, style }: Props) {
  const { colors, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const glowOpacity = mode === 'dark' ? 0.32 : 0.1;
  return (
    <View style={styles.root}>
      <LinearGradient
        colors={colors.backgroundGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="screenGlow" cx="0.85" cy="0.06" r="0.9">
            <Stop offset="0" stopColor={colors.accent} stopOpacity={glowOpacity} />
            <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#screenGlow)" />
      </Svg>
      <View
        style={[
          styles.content,
          { paddingTop: topInset ? insets.top : 0, paddingBottom: bottomInset ? insets.bottom : 0 },
          style,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1 },
});

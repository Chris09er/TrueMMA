import { type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
 * Full-bleed screen wrapper: paints the subtle, static Blue Alloy background
 * gradient behind the content and handles safe-area insets. Every redesigned
 * screen roots in this.
 */
export default function Screen({ children, topInset = true, bottomInset = false, style }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <LinearGradient
        colors={colors.backgroundGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
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

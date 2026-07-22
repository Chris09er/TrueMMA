import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { pressedStyle, useTheme } from '../lib/theme';

type Props = {
  active: boolean;
  busy: boolean;
  onPress: (event: { stopPropagation?: () => void }) => void;
  icon?: keyof typeof Ionicons.glyphMap;
  offsetRight?: number;
  /** Inline (44pt tappable in normal flow) instead of absolute card-corner. */
  inline?: boolean;
};

export default function BellIconButton({
  active,
  busy,
  onPress,
  icon = 'notifications',
  offsetRight = 10,
  inline = false,
}: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [
        inline ? styles.inline : [styles.button, { right: offsetRight }],
        pressed && pressedStyle,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.textSecondary} />
      ) : (
        <Ionicons name={icon} size={20} color={active ? colors.accent : colors.textSecondary} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    top: 10,
    padding: 4,
    zIndex: 1,
  },
  inline: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

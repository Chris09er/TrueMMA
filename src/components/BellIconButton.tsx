import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../lib/theme';

type Props = {
  active: boolean;
  busy: boolean;
  onPress: (event: { stopPropagation?: () => void }) => void;
  icon?: keyof typeof Ionicons.glyphMap;
  offsetRight?: number;
};

export default function BellIconButton({
  active,
  busy,
  onPress,
  icon = 'notifications',
  offsetRight = 10,
}: Props) {
  return (
    <Pressable onPress={onPress} hitSlop={10} style={[styles.button, { right: offsetRight }]}>
      {busy ? (
        <ActivityIndicator size="small" color={colors.textSecondary} />
      ) : (
        <Ionicons name={icon} size={20} color={active ? colors.accentGold : colors.textSecondary} />
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
});

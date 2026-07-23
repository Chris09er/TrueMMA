import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ContactStackParamList } from '../navigation';
import { useLocale } from '../lib/i18n';
import { pressedStyle, radius, spacing, typography, useTheme, type ColorTokens } from '../lib/theme';
import { Screen, ScreenHeader } from '../components/ui';

type Props = NativeStackScreenProps<ContactStackParamList, 'Legal'>;

// Datenschutz / Impressum. Placeholder content for now (see translations'
// `legal` section) — the screens and navigation exist so the real text is a
// content swap, not a structural change, before release.
export default function LegalScreen({ route, navigation }: Props) {
  const { doc } = route.params;
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const title = doc === 'privacy' ? t.legal.privacyTitle : t.legal.imprintTitle;
  const body = doc === 'privacy' ? t.legal.privacyBody : t.legal.imprintBody;

  return (
    <Screen>
      <ScreenHeader
        left={
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={8}
            accessibilityRole="button"
            style={({ pressed }) => [styles.iconButton, pressed && pressedStyle]}
          >
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </Pressable>
        }
        title={title.toUpperCase()}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.notice}>{t.legal.placeholderNotice}</Text>
        <Text style={styles.body}>{body}</Text>
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    scroll: { padding: spacing.lg },
    notice: {
      ...typography.caption,
      alignSelf: 'flex-start',
      color: colors.alloy,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.alloyMuted,
      borderRadius: radius.control,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      marginBottom: spacing.lg,
    },
    body: { ...typography.body, color: colors.textSecondary },
  });

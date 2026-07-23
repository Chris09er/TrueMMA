import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocale } from '../lib/i18n';
import {
  hasShownFirstSaveHint,
  isSaved,
  markFirstSaveHintShown,
  save,
  unsave,
  type SaveKind,
} from '../lib/saves';
import { pressedStyle, useTheme, type ColorTokens } from '../lib/theme';
import BellIconButton from './BellIconButton';

type Props = {
  kind: SaveKind;
  id: string;
  /** Controlled initial state (list screens already hold the id-set). When
   *  omitted, the heart looks up its own state via isSaved. */
  active?: boolean;
  onToggle?: (active: boolean) => void;
  inline?: boolean;
  offsetRight?: number;
  /** When set, renders the inline text+icon variant (used next to an
   *  organization name in running text) instead of the card-corner heart. */
  label?: { on: string; off: string };
};

// The single ❤️ that both saves an object to the merkliste and turns its push
// notifications on (defaults tunable per object in the profile). Replaces the
// former split of favorite-heart vs follow-bell. Saving is device-anchored and
// never blocked by the permission prompt; the first tap on the device shows a
// one-time hint before the OS asks for notification permission.
export default function SaveHeart({ kind, id, active, onToggle, inline, offsetRight, label }: Props) {
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [activeState, setActiveState] = useState(active ?? false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (active !== undefined) {
      setActiveState(active);
      return;
    }
    isSaved(kind, id).then(setActiveState);
  }, [kind, id, active]);

  const showFirstTapHint = () =>
    new Promise<void>((resolve) => {
      Alert.alert(t.saves.hintTitle, t.saves.hintBody, [{ text: t.saves.hintButton, onPress: () => resolve() }], {
        onDismiss: () => resolve(),
      });
    });

  const handlePress = async (event?: { stopPropagation?: () => void }) => {
    event?.stopPropagation?.();
    if (busy) return;
    setBusy(true);
    try {
      if (!activeState) {
        if (!(await hasShownFirstSaveHint())) {
          await showFirstTapHint();
          await markFirstSaveHintShown();
        }
        const result = await save(kind, id);
        if (result === 'error') {
          Alert.alert(t.notifications.genericErrorTitle, t.notifications.genericErrorBody);
          return;
        }
        setActiveState(true);
        onToggle?.(true);
      } else {
        const result = await unsave(kind, id);
        if (result === 'error') {
          Alert.alert(t.notifications.genericErrorTitle, t.notifications.genericErrorBody);
          return;
        }
        setActiveState(false);
        onToggle?.(false);
      }
    } catch (err) {
      console.error('SaveHeart press failed:', err);
      Alert.alert(
        t.notifications.genericErrorTitle,
        `${t.notifications.genericErrorBody}\n\n${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setBusy(false);
    }
  };

  if (label) {
    return (
      <Pressable onPress={() => handlePress()} hitSlop={8} style={({ pressed }) => [styles.labelButton, pressed && pressedStyle]}>
        {busy ? (
          <ActivityIndicator size="small" color={colors.textSecondary} />
        ) : (
          <Ionicons
            name={activeState ? 'heart' : 'heart-outline'}
            size={15}
            color={activeState ? colors.accent : colors.textSecondary}
          />
        )}
        <Text style={[styles.label, activeState && styles.labelActive]}>{activeState ? label.on : label.off}</Text>
      </Pressable>
    );
  }

  return (
    <BellIconButton
      active={activeState}
      busy={busy}
      onPress={handlePress}
      icon={activeState ? 'heart' : 'heart-outline'}
      offsetRight={offsetRight ?? 38}
      inline={inline}
    />
  );
}

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    labelButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      alignSelf: 'flex-start',
    },
    label: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    labelActive: {
      color: colors.accent,
    },
  });

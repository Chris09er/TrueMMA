import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocale } from '../lib/i18n';
import { followOrganization, isFollowingOrganization, unfollowOrganization } from '../lib/organizationFollows';
import { pressedStyle, useTheme, type ColorTokens } from '../lib/theme';

type Props = {
  organizationId: string;
};

// Inline (not absolute-positioned like BellIconButton) since this sits next
// to the organization name in running text, not pinned to a card corner.
export default function OrganizationFollowBell({ organizationId }: Props) {
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    isFollowingOrganization(organizationId).then(setActive);
  }, [organizationId]);

  const handlePress = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = active ? await unfollowOrganization(organizationId) : await followOrganization(organizationId);

      if (result === 'permission_denied') {
        Alert.alert(t.notifications.permissionDeniedTitle, t.notifications.permissionDeniedBody);
        return;
      }
      if (result === 'error') {
        Alert.alert(t.notifications.genericErrorTitle, t.notifications.genericErrorBody);
        return;
      }
      if (active) {
        Alert.alert(t.notifications.organizationFollowOffTitle, t.notifications.organizationFollowOffBody);
      } else {
        Alert.alert(t.notifications.organizationFollowOnTitle, t.notifications.organizationFollowOnBody);
      }
      setActive(!active);
    } catch (err) {
      console.error('OrganizationFollowBell press failed:', err);
      Alert.alert(
        t.notifications.genericErrorTitle,
        `${t.notifications.genericErrorBody}\n\n${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={8}
      style={({ pressed }) => [styles.button, pressed && pressedStyle]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.textSecondary} />
      ) : (
        <Ionicons name={active ? 'notifications' : 'notifications-outline'} size={15} color={active ? colors.accent : colors.textSecondary} />
      )}
      <Text style={[styles.label, active && styles.labelActive]}>
        {active ? t.eventDetail.unfollowOrganization : t.eventDetail.followOrganization}
      </Text>
    </Pressable>
  );
}

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    button: {
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

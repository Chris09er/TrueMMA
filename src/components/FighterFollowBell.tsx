import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useLocale } from '../lib/i18n';
import { followFighter, isFollowingFighter, unfollowFighter } from '../lib/pushSubscriptions';
import BellIconButton from './BellIconButton';

type Props = {
  fighterId: string;
};

export default function FighterFollowBell({ fighterId }: Props) {
  const { t } = useLocale();
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    isFollowingFighter(fighterId).then(setActive);
  }, [fighterId]);

  const handlePress = async (event: { stopPropagation?: () => void }) => {
    event.stopPropagation?.();
    if (busy) return;
    setBusy(true);
    try {
      const result = active ? await unfollowFighter(fighterId) : await followFighter(fighterId);

      if (result === 'permission_denied') {
        Alert.alert(t.notifications.permissionDeniedTitle, t.notifications.permissionDeniedBody);
        return;
      }
      if (result === 'error') {
        Alert.alert(t.notifications.genericErrorTitle, t.notifications.genericErrorBody);
        return;
      }
      setActive(!active);
    } finally {
      setBusy(false);
    }
  };

  return <BellIconButton active={active} busy={busy} onPress={handlePress} />;
}

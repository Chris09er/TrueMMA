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
      const success = active
        ? await unfollowFighter(fighterId)
        : await followFighter(fighterId);

      if (!success) {
        Alert.alert(t.notifications.permissionDeniedTitle, t.notifications.permissionDeniedBody);
        return;
      }
      setActive(!active);
    } finally {
      setBusy(false);
    }
  };

  return <BellIconButton active={active} busy={busy} onPress={handlePress} />;
}

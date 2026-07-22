import { useEffect, useState } from 'react';
import { isEventFavorited, toggleEventFavorite } from '../lib/favorites';
import BellIconButton from './BellIconButton';

type Props = {
  eventId: string;
  onToggle?: (active: boolean) => void;
  inline?: boolean;
};

export default function EventFavoriteHeart({ eventId, onToggle, inline }: Props) {
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    isEventFavorited(eventId).then(setActive);
  }, [eventId]);

  const handlePress = async (event: { stopPropagation?: () => void }) => {
    event.stopPropagation?.();
    if (busy) return;
    setBusy(true);
    try {
      const next = await toggleEventFavorite(eventId);
      setActive(next);
      onToggle?.(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BellIconButton
      active={active}
      busy={busy}
      onPress={handlePress}
      icon={active ? 'heart' : 'heart-outline'}
      offsetRight={38}
      inline={inline}
    />
  );
}

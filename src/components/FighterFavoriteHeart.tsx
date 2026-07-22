import { useEffect, useState } from 'react';
import { isFighterFavorited, toggleFighterFavorite } from '../lib/favorites';
import BellIconButton from './BellIconButton';

type Props = {
  fighterId: string;
  onToggle?: (active: boolean) => void;
  inline?: boolean;
};

export default function FighterFavoriteHeart({ fighterId, onToggle, inline }: Props) {
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    isFighterFavorited(fighterId).then(setActive);
  }, [fighterId]);

  const handlePress = async (event: { stopPropagation?: () => void }) => {
    event.stopPropagation?.();
    if (busy) return;
    setBusy(true);
    try {
      const next = await toggleFighterFavorite(fighterId);
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

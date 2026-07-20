import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { FightersStackParamList, RootTabParamList } from '../navigation';
import { getFighterById, getFighterFights, isEventUpcoming } from '../lib/queries';
import type { Fighter, FightWithEvent } from '../lib/types';
import { pressedStyle, radius, spacing, useCommonStyles, useTheme, type ColorTokens } from '../lib/theme';
import { formatEventDate } from '../lib/dateFormat';
import { useLocale } from '../lib/i18n';
import FighterFollowBell from '../components/FighterFollowBell';
import FighterFavoriteHeart from '../components/FighterFavoriteHeart';

type Props = NativeStackScreenProps<FightersStackParamList, 'FighterDetail'>;
type Styles = ReturnType<typeof makeStyles>;

function inchesToCm(inches: number): number {
  return Math.round(inches * 2.54);
}

function formatRecord(fighter: Fighter): string | null {
  const { record_wins: wins, record_losses: losses, record_draws: draws, record_no_contests: nc } = fighter;
  if (wins === null && losses === null && draws === null) return null;
  const base = `${wins ?? 0}-${losses ?? 0}-${draws ?? 0}`;
  return nc ? `${base} (${nc} NC)` : base;
}

export default function FighterDetailScreen({ route }: Props) {
  const { fighterId, fighterName } = route.params;
  const { t, locale } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const commonStyles = useCommonStyles();
  const [fighter, setFighter] = useState<Fighter | null>(null);
  const [fights, setFights] = useState<FightWithEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([getFighterById(fighterId), getFighterFights(fighterId)])
      .then(([fighterData, fightsData]) => {
        setFighter(fighterData);
        setFights(fightsData);
      })
      .catch(() => setError(t.common.error))
      .finally(() => setLoading(false));
  }, [fighterId, t]);

  if (loading) {
    return <ActivityIndicator style={commonStyles.center} color={colors.textPrimary} />;
  }

  if (error) {
    return <Text style={commonStyles.error}>{error}</Text>;
  }

  const upcomingFights = fights
    .filter((fight) => fight.event && isEventUpcoming(fight.event.event_date))
    .sort((a, b) => new Date(a.event!.event_date).getTime() - new Date(b.event!.event_date).getTime());
  const pastFights = fights.filter((fight) => fight.event && !isEventUpcoming(fight.event.event_date));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <FighterFollowBell fighterId={fighterId} />
        <FighterFavoriteHeart fighterId={fighterId} />
        {fighter?.photo_url && <Image source={{ uri: fighter.photo_url }} style={styles.photo} />}
        <Text style={styles.name}>{fighter?.name ?? fighterName}</Text>
        {(fighter?.nickname || fighter?.nationality) && (
          <Text style={styles.meta}>
            {[fighter?.nickname && `"${fighter.nickname}"`, fighter?.nationality].filter(Boolean).join(' · ')}
          </Text>
        )}
        {fighter && formatRecord(fighter) && <Text style={styles.record}>{formatRecord(fighter)}</Text>}
        <View style={styles.linkRow}>
          {fighter?.tapology_url && (
            <Pressable
              style={({ pressed }) => [styles.linkButton, pressed && pressedStyle]}
              onPress={() => Linking.openURL(fighter.tapology_url!)}
            >
              <Text style={styles.linkButtonText}>{t.fighterDetail.tapologyButton}</Text>
            </Pressable>
          )}
          {fighter?.sherdog_url && (
            <Pressable
              style={({ pressed }) => [styles.linkButton, pressed && pressedStyle]}
              onPress={() => Linking.openURL(fighter.sherdog_url!)}
            >
              <Text style={styles.linkButtonText}>{t.fighterDetail.sherdogButton}</Text>
            </Pressable>
          )}
        </View>
      </View>

      {fighter && <TaleOfTheTape fighter={fighter} locale={locale} t={t} styles={styles} />}

      {upcomingFights.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.fighterDetail.upcomingFight}</Text>
          {upcomingFights.map((fight) => (
            <FightRow key={fight.id} fight={fight} fighterId={fighterId} locale={locale} t={t} styles={styles} />
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t.fighterDetail.fightHistory}</Text>
        {pastFights.length === 0 ? (
          <Text style={commonStyles.empty}>{t.fighterDetail.noFightHistory}</Text>
        ) : (
          pastFights.map((fight) => (
            <FightRow key={fight.id} fight={fight} fighterId={fighterId} locale={locale} t={t} styles={styles} />
          ))
        )}
      </View>
    </ScrollView>
  );
}

function TaleOfTheTape({
  fighter,
  locale,
  t,
  styles,
}: {
  fighter: Fighter;
  locale: string;
  t: ReturnType<typeof useLocale>['t'];
  styles: Styles;
}) {
  const rows: { label: string; value: string }[] = [];
  if (fighter.weight_class) rows.push({ label: t.fighterDetail.weightClass, value: fighter.weight_class });
  if (fighter.height_inches) {
    rows.push({ label: t.fighterDetail.height, value: `${inchesToCm(fighter.height_inches)} cm` });
  }
  if (fighter.reach_inches) {
    rows.push({ label: t.fighterDetail.reach, value: `${inchesToCm(fighter.reach_inches)} cm` });
  }
  if (fighter.stance) rows.push({ label: t.fighterDetail.stance, value: fighter.stance });
  if (fighter.date_of_birth) {
    rows.push({
      label: t.fighterDetail.dateOfBirth,
      value: new Date(fighter.date_of_birth).toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-US'),
    });
  }
  if (fighter.birth_place) rows.push({ label: t.fighterDetail.birthPlace, value: fighter.birth_place });

  if (rows.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t.fighterDetail.taleOfTheTape}</Text>
      <View style={styles.tapeCard}>
        {rows.map((row) => (
          <View key={row.label} style={styles.tapeRow}>
            <Text style={styles.tapeLabel}>{row.label}</Text>
            <Text style={styles.tapeValue}>{row.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function FightRow({
  fight,
  fighterId,
  locale,
  t,
  styles,
}: {
  fight: FightWithEvent;
  fighterId: string;
  locale: string;
  t: ReturnType<typeof useLocale>['t'];
  styles: Styles;
}) {
  const navigation = useNavigation<NavigationProp<RootTabParamList>>();
  const opponent = fight.fighter1?.id === fighterId ? fight.fighter2 : fight.fighter1;
  const isWinner = fight.result_winner_id === fighterId;
  const hasResult = fight.result_winner_id !== null;

  return (
    <View style={styles.fightRow}>
      <Text
        style={[styles.fightOpponent, opponent && styles.fightRowLink]}
        onPress={
          opponent
            ? () =>
                navigation.navigate('FightersTab', {
                  screen: 'FighterDetail',
                  params: { fighterId: opponent.id, fighterName: opponent.name },
                })
            : undefined
        }
      >
        {t.fighterDetail.vs} {opponent?.name ?? 'TBA'}
      </Text>
      {fight.event && (
        <Text
          style={[styles.fightEventMeta, styles.fightRowLink]}
          onPress={() =>
            navigation.navigate('EventsTab', {
              screen: 'EventDetail',
              params: { eventId: fight.event!.id, eventName: fight.event!.name },
            })
          }
        >
          {fight.event.name} · {formatEventDate(fight.event.event_date, locale)}
        </Text>
      )}
      {hasResult && (
        <Text style={[styles.fightResult, isWinner ? styles.fightResultWin : styles.fightResultLoss]}>
          {isWinner ? t.fighterDetail.resultWin : t.fighterDetail.resultLoss}
          {fight.result_method_detail || fight.result_method
            ? ` · ${fight.result_method_detail ?? fight.result_method}`
            : ''}
          {fight.result_round ? ` · ${t.eventDetail.round} ${fight.result_round}` : ''}
        </Text>
      )}
    </View>
  );
}

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: spacing.lg,
    },
    header: {
      alignItems: 'center',
      marginBottom: spacing.xl,
      position: 'relative',
    },
    photo: {
      width: 96,
      height: 96,
      borderRadius: 48,
      marginBottom: spacing.md,
      backgroundColor: colors.surface,
    },
    name: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.textPrimary,
      textAlign: 'center',
    },
    meta: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 4,
      textAlign: 'center',
    },
    record: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.accent,
      marginTop: 6,
    },
    tapeCard: {
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    tapeRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    tapeLabel: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    tapeValue: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    linkRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.lg,
    },
    linkButton: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingVertical: 10,
      paddingHorizontal: spacing.md,
    },
    linkButtonText: {
      color: colors.textPrimary,
      fontWeight: '600',
      fontSize: 13,
    },
    section: {
      marginBottom: spacing.xl,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: spacing.sm,
    },
    fightRow: {
      padding: 14,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    fightOpponent: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    fightEventMeta: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    fightRowLink: {
      textDecorationLine: 'underline',
    },
    fightResult: {
      fontSize: 12,
      marginTop: 6,
      fontWeight: '700',
    },
    fightResultWin: {
      color: colors.accent,
    },
    fightResultLoss: {
      color: colors.textSecondary,
    },
  });

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { FightersStackParamList, RootTabParamList } from '../navigation';
import { formatRecord, getFighterById, getFighterFights, isEventUpcoming } from '../lib/queries';
import type { Fighter, FightWithEvent } from '../lib/types';
import { pressedStyle, spacing, tabularNums, typography, useTheme, type ColorTokens } from '../lib/theme';
import { formatEventDate } from '../lib/dateFormat';
import { useLocale } from '../lib/i18n';
import Flag from '../components/Flag';
import SaveHeart from '../components/SaveHeart';
import ResultBadge from '../components/ResultBadge';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Screen,
  ScreenHeader,
  SectionHeader,
  StatTable,
  type StatRow,
} from '../components/ui';

type Props = NativeStackScreenProps<FightersStackParamList, 'FighterDetail'>;
type Styles = ReturnType<typeof makeStyles>;
type Loc = ReturnType<typeof useLocale>['t'];

const inchesToCm = (inches: number) => Math.round(inches * 2.54);
const formatHeight = (inches: number) => `${Math.floor(inches / 12)}' ${inches % 12}"`;

function FightHistoryRow({
  fight,
  fighterId,
  locale,
  t,
  styles,
  isFirst,
}: {
  fight: FightWithEvent;
  fighterId: string;
  locale: string;
  t: Loc;
  styles: Styles;
  isFirst: boolean;
}) {
  const navigation = useNavigation<NavigationProp<RootTabParamList>>();
  const opponent = fight.fighter1?.id === fighterId ? fight.fighter2 : fight.fighter1;
  // Mirror EventDetail's fightOutcome: winner/loser from result_winner_id, and
  // draws / no-contests (no winner) read from the free-text result_method, so a
  // decided draw/NC still shows an outcome instead of a blank row.
  const method = (fight.result_method ?? '').toLowerCase();
  const outcome: 'win' | 'loss' | 'draw' | 'nc' | null =
    fight.result_method == null
      ? null
      : fight.result_winner_id
        ? fight.result_winner_id === fighterId
          ? 'win'
          : 'loss'
        : method.includes('no contest')
          ? 'nc'
          : method.includes('draw')
            ? 'draw'
            : null;
  const outcomeLabel =
    outcome === 'win'
      ? t.fighterDetail.resultWin
      : outcome === 'loss'
        ? t.fighterDetail.resultLoss
        : outcome === 'draw'
          ? t.fighterDetail.resultDraw
          : t.fighterDetail.resultNc;
  // Win/loss: append the finish method. Draw/NC: the label already says it, so
  // only add a specific detail when one exists (never the generic "Draw").
  const outcomeDetail =
    outcome === 'win' || outcome === 'loss'
      ? fight.result_method_detail || fight.result_method
      : fight.result_method_detail;
  return (
    <View style={[styles.historyRow, !isFirst && styles.historyDivider]}>
      <Text
        style={styles.opponent}
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
          style={styles.historyMeta}
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
      {outcome && (
        <View style={styles.resultRow}>
          <ResultBadge outcome={outcome} label={outcomeLabel} />
          {(outcomeDetail || fight.result_round) && (
            <Text style={styles.resultMeta} numberOfLines={1}>
              {[outcomeDetail, fight.result_round ? `${t.eventDetail.round} ${fight.result_round}` : null]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

export default function FighterDetailScreen({ route, navigation }: Props) {
  const { fighterId, fighterName } = route.params;
  const { t, locale } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [fighter, setFighter] = useState<Fighter | null>(null);
  const [fights, setFights] = useState<FightWithEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([getFighterById(fighterId), getFighterFights(fighterId)])
      .then(([fighterData, fightsData]) => {
        setFighter(fighterData);
        setFights(fightsData);
      })
      .catch(() => setError(t.common.error))
      .finally(() => setLoading(false));
  };

  useEffect(load, [fighterId, t]);

  const header = (
    <ScreenHeader
      left={
        <Ionicons
          name="chevron-back"
          size={26}
          color={colors.textPrimary}
          onPress={() => navigation.goBack()}
          style={styles.backIcon}
        />
      }
      title={t.fighterDetail.title}
      right={<SaveHeart inline kind="fighter" id={fighterId} />}
    />
  );

  if (loading) {
    return (
      <Screen>
        {header}
        <ActivityIndicator style={styles.centered} color={colors.textPrimary} />
      </Screen>
    );
  }
  if (error) {
    return (
      <Screen>
        {header}
        <ErrorState message={error} retryLabel={t.common.retry} onRetry={load} />
      </Screen>
    );
  }

  const record = fighter ? formatRecord(fighter) : null;

  // Stats not stored on the fighter — derived from completed fights.
  const completed = fights.filter((f) => f.event && f.result_method != null);
  const orderedDesc = [...completed].sort(
    (a, b) => new Date(b.event!.event_date).getTime() - new Date(a.event!.event_date).getTime()
  );
  // KO%/Sub% are a *finish rate* over the wins we can actually classify from the
  // loaded fight history — so the denominator must be those same completed wins,
  // NOT the career record_wins (which can far exceed the fights present in the
  // DB and would understate the percentages).
  const completedWins = completed.filter((f) => f.result_winner_id === fighterId).length;
  const koWins = completed.filter(
    (f) => f.result_winner_id === fighterId && /\b(ko|tko)\b/i.test(f.result_method ?? '')
  ).length;
  const subWins = completed.filter(
    (f) => f.result_winner_id === fighterId && /submission/i.test(f.result_method ?? '')
  ).length;
  let winStreak = 0;
  for (const f of orderedDesc) {
    if (f.result_winner_id === fighterId) winStreak += 1;
    else break;
  }
  const pct = (n: number) => (completedWins > 0 ? `${Math.round((n / completedWins) * 100)}%` : undefined);

  const statRows: StatRow[] = [];
  if (fighter?.weight_class) {
    statRows.push({
      label: t.fighterDetail.weightClass,
      value: fighter.weight_class,
      trailing: fighter.weight_lbs ? `${fighter.weight_lbs} LB` : undefined,
    });
  }
  if (fighter?.height_inches) {
    statRows.push({ label: t.fighterDetail.height, value: formatHeight(fighter.height_inches), trailing: `${inchesToCm(fighter.height_inches)} CM` });
  }
  if (fighter?.reach_inches) {
    statRows.push({ label: t.fighterDetail.reach, value: `${fighter.reach_inches}"`, trailing: `${inchesToCm(fighter.reach_inches)} CM` });
  }
  if (fighter?.stance) statRows.push({ label: t.fighterDetail.stance, value: fighter.stance });
  if (fighter?.date_of_birth) {
    statRows.push({
      label: t.fighterDetail.dateOfBirth,
      value: new Date(fighter.date_of_birth).toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    });
  }
  if (completed.length > 0) {
    statRows.push({ label: t.fighterDetail.koWins, value: String(koWins), trailing: pct(koWins) });
    statRows.push({ label: t.fighterDetail.submissionWins, value: String(subWins), trailing: pct(subWins) });
    statRows.push({ label: t.fighterDetail.winStreak, value: String(winStreak) });
  }

  const upcomingFights = fights
    .filter((fight) => fight.event && isEventUpcoming(fight.event.event_date))
    .sort((a, b) => new Date(a.event!.event_date).getTime() - new Date(b.event!.event_date).getTime());
  const pastFights = fights.filter((fight) => fight.event && !isEventUpcoming(fight.event.event_date));

  return (
    <Screen>
      {header}
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.identity}>
          <View style={styles.nameRow}>
            <Flag country={fighter?.nationality} height={20} />
            <Text style={styles.name} numberOfLines={2}>
              {fighter?.name ?? fighterName}
            </Text>
          </View>
          {record && <Text style={styles.record}>{record}</Text>}
          {fighter?.weight_class && <Text style={styles.weightClassLabel}>{fighter.weight_class.toUpperCase()}</Text>}
          {fighter?.nickname && <Text style={styles.nickname}>&ldquo;{fighter.nickname}&rdquo;</Text>}
        </View>

        {statRows.length > 0 && <StatTable rows={statRows} />}

        {(fighter?.tapology_url || fighter?.sherdog_url) && (
          <View style={styles.linkRow}>
            {fighter?.tapology_url && (
              <Button
                variant="secondary"
                label={t.fighterDetail.tapologyButton}
                onPress={() => Linking.openURL(fighter.tapology_url!)}
              />
            )}
            {fighter?.sherdog_url && (
              <Button
                variant="secondary"
                label={t.fighterDetail.sherdogButton}
                onPress={() => Linking.openURL(fighter.sherdog_url!)}
              />
            )}
          </View>
        )}

        {upcomingFights.length > 0 && (
          <>
            <SectionHeader title={t.fighterDetail.upcomingFight} />
            <Card style={styles.historyCard}>
              {upcomingFights.map((fight, i) => (
                <FightHistoryRow
                  key={fight.id}
                  fight={fight}
                  fighterId={fighterId}
                  locale={locale}
                  t={t}
                  styles={styles}
                  isFirst={i === 0}
                />
              ))}
            </Card>
          </>
        )}

        <SectionHeader title={t.fighterDetail.fightHistory} />
        {pastFights.length === 0 ? (
          <EmptyState title={t.fighterDetail.noFightHistory} />
        ) : (
          <Card style={styles.historyCard}>
            {pastFights.map((fight, i) => (
              <FightHistoryRow
                key={fight.id}
                fight={fight}
                fighterId={fighterId}
                locale={locale}
                t={t}
                styles={styles}
                isFirst={i === 0}
              />
            ))}
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    backIcon: { minWidth: 44, minHeight: 44, textAlign: 'center', textAlignVertical: 'center', lineHeight: 44 },
    centered: { marginTop: 40 },
    scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },

    identity: { marginBottom: spacing.lg },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    name: { ...typography.display, color: colors.textPrimary, flexShrink: 1 },
    record: { ...typography.title, ...tabularNums, color: colors.textPrimary, marginTop: spacing.xs },
    weightClassLabel: { ...typography.label, color: colors.textSecondary, marginTop: spacing.xs },
    nickname: { ...typography.body, color: colors.textSecondary, fontStyle: 'italic', marginTop: spacing.xs },

    linkRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },

    historyCard: { padding: 0 },
    historyRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
    historyDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
    opponent: { ...typography.cardTitle, fontSize: 16, lineHeight: 20, color: colors.textPrimary },
    historyMeta: { ...typography.meta, color: colors.focus, marginTop: 2 },
    resultRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
    resultMeta: { ...typography.meta, color: colors.textSecondary, flexShrink: 1 },
  });

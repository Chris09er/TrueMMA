import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { EventsStackParamList, RootTabParamList } from '../navigation';
import { abbreviateWeightClass, getEventDetail, getFightsForEvent, isEventLive, isEventUpcoming } from '../lib/queries';
import type { CardSegment, EventDetail, Fight, Fighter } from '../lib/types';
import { castVote, getEventVotes, type FightVoteSummary } from '../lib/voting';
import { pressedStyle, radius, spacing, tabularNums, typography, useTheme, type ColorTokens } from '../lib/theme';
import { formatEventDateTime } from '../lib/dateFormat';
import { useLocale } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import Flag from '../components/Flag';
import EventReminderBell from '../components/EventReminderBell';
import EventFavoriteHeart from '../components/EventFavoriteHeart';
import LiveBadge from '../components/LiveBadge';
import OrganizationFollowBell from '../components/OrganizationFollowBell';
import { Card, EmptyState, ErrorState, Screen, ScreenHeader } from '../components/ui';

type Props = NativeStackScreenProps<EventsStackParamList, 'EventDetail'>;
type Styles = ReturnType<typeof makeStyles>;
type Loc = ReturnType<typeof useLocale>['t'];

const SEGMENT_ORDER: CardSegment[] = ['main_card', 'prelims', 'early_prelims'];

function formatRecord(fighter: Fighter | null): string | null {
  if (!fighter) return null;
  const { record_wins: w, record_losses: l, record_draws: d, record_no_contests: nc } = fighter;
  if (w == null && l == null && d == null) return null;
  const base = `${w ?? 0}-${l ?? 0}-${d ?? 0}`;
  return nc ? `${base} (${nc} NC)` : base;
}

type FightOutcome = 'win' | 'loss' | 'draw' | 'nc';

// A fighter's result in a *completed* fight. Winner/loser come straight from
// result_winner_id; draws and no-contests have no winner and are read from
// result_method (free text from balldontlie — "Draw" / "No Contest", matched
// case-insensitively). Anything not yet completed returns null (no badge —
// that fight is instead eligible for voting).
function fightOutcome(fight: Fight, fighterId: string | undefined): FightOutcome | null {
  if (!fighterId || fight.status !== 'completed') return null;
  if (fight.result_winner_id) return fight.result_winner_id === fighterId ? 'win' : 'loss';
  const method = (fight.result_method ?? '').toLowerCase();
  if (method.includes('no contest')) return 'nc';
  if (method.includes('draw')) return 'draw';
  return null;
}

function ResultBadge({ outcome, styles, t }: { outcome: FightOutcome; styles: Styles; t: Loc }) {
  const config: Record<FightOutcome, { box: object; text: object; label: string }> = {
    win: { box: styles.badgeWin, text: styles.badgeWinText, label: t.eventDetail.resultWin },
    loss: { box: styles.badgeLoss, text: styles.badgeLossText, label: t.eventDetail.resultLoss },
    draw: { box: styles.badgeNeutral, text: styles.badgeNeutralText, label: t.eventDetail.resultDraw },
    nc: { box: styles.badgeNeutral, text: styles.badgeNeutralText, label: t.eventDetail.resultNc },
  };
  const { box, text, label } = config[outcome];
  return (
    <View style={[styles.resultBadge, box]}>
      <Text style={[styles.resultBadgeText, text]}>{label}</Text>
    </View>
  );
}

function FighterCell({
  fighter,
  align,
  outcome,
  styles,
  t,
}: {
  fighter: Fighter | null;
  align: 'left' | 'right';
  outcome: FightOutcome | null;
  styles: Styles;
  t: Loc;
}) {
  const navigation = useNavigation<NavigationProp<RootTabParamList>>();
  const right = align === 'right';
  const record = formatRecord(fighter);
  const name = fighter?.name ?? 'TBA';
  return (
    <View style={[styles.fighterCell, right ? styles.alignEnd : styles.alignStart]}>
      <View style={[styles.fighterHead, right && styles.rowReverse]}>
        <Flag country={fighter?.nationality} height={12} />
        <View style={styles.fighterNameWrap}>
          <Text
            style={[styles.fighterName, right && styles.textRight]}
            numberOfLines={2}
            onPress={
              fighter
                ? () =>
                    navigation.navigate('FightersTab', {
                      screen: 'FighterDetail',
                      params: { fighterId: fighter.id, fighterName: fighter.name },
                    })
                : undefined
            }
          >
            {name}
          </Text>
        </View>
      </View>
      {(outcome || record) && (
        <View style={[styles.metaRow, right && styles.rowReverse]}>
          {outcome && <ResultBadge outcome={outcome} styles={styles} t={t} />}
          {record && <Text style={[styles.record, right && styles.textRight]}>{record}</Text>}
        </View>
      )}
    </View>
  );
}

// A fight is open for voting while it hasn't been settled: both fighters
// known, not cancelled, and not yet completed (a Draw/NC is completed, so it
// drops out of voting the same as a decided fight).
function isVotable(fight: Fight): boolean {
  return !!fight.fighter1 && !!fight.fighter2 && fight.status !== 'completed' && fight.status !== 'cancelled';
}

function FightVoteRow({
  fight,
  summary,
  onVote,
  styles,
  t,
}: {
  fight: Fight;
  summary: FightVoteSummary;
  onVote: (fightId: string, fighterId: string) => void;
  styles: Styles;
  t: Loc;
}) {
  if (!fight.fighter1 || !fight.fighter2) return null;
  const fighter1 = fight.fighter1;
  const fighter2 = fight.fighter2;

  if (!summary.myVote) {
    return (
      <View style={styles.voteRow}>
        <Pressable
          style={({ pressed }) => [styles.voteButton, pressed && pressedStyle]}
          onPress={() => onVote(fight.id, fighter1.id)}
        >
          <Text style={styles.voteButtonText} numberOfLines={1}>
            {t.eventDetail.votePick} {fighter1.name}
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.voteButton, pressed && pressedStyle]}
          onPress={() => onVote(fight.id, fighter2.id)}
        >
          <Text style={styles.voteButtonText} numberOfLines={1}>
            {t.eventDetail.votePick} {fighter2.name}
          </Text>
        </Pressable>
      </View>
    );
  }

  const total = summary.fighter1Votes + summary.fighter2Votes;
  const pct1 = total > 0 ? Math.round((summary.fighter1Votes / total) * 100) : 50;
  const pct2 = 100 - pct1;

  return (
    <View style={styles.voteBarContainer}>
      <View style={styles.voteBarLabelsRow}>
        <Text style={[styles.voteBarLabel, summary.myVote === fighter1.id && styles.voteBarLabelActive]} numberOfLines={1}>
          {fighter1.name} · {pct1}%
        </Text>
        <Text style={[styles.voteBarLabel, summary.myVote === fighter2.id && styles.voteBarLabelActive]} numberOfLines={1}>
          {pct2}% · {fighter2.name}
        </Text>
      </View>
      <View style={styles.voteBarTrack}>
        <View style={[styles.voteBarFill1, { flex: Math.max(pct1, 1) }]} />
        <View style={[styles.voteBarFill2, { flex: Math.max(pct2, 1) }]} />
      </View>
    </View>
  );
}

function FightRow({
  fight,
  voteSummary,
  onVote,
  t,
  styles,
}: {
  fight: Fight;
  voteSummary: FightVoteSummary;
  onVote: (fightId: string, fighterId: string) => void;
  t: Loc;
  styles: Styles;
}) {
  const cancelled = fight.status === 'cancelled';
  const hasBanner = fight.is_main_event || fight.is_title_fight || cancelled;
  const rounds = fight.scheduled_rounds ? `${fight.scheduled_rounds} ${t.eventDetail.rounds}` : null;
  const weight = abbreviateWeightClass(fight.weight_class);
  return (
    <View style={[styles.fightRow, cancelled && styles.cancelled]}>
      {hasBanner && (
        <View style={styles.bannerRow}>
          {cancelled && (
            <View style={[styles.tag, styles.tagCancelled]}>
              <Text style={styles.tagCancelledText}>{t.eventDetail.cancelled}</Text>
            </View>
          )}
          {fight.is_main_event && (
            <View style={[styles.tag, styles.tagMain]}>
              <Text style={styles.tagMainText}>{t.eventDetail.mainEvent}</Text>
            </View>
          )}
          {fight.is_title_fight && (
            <View style={[styles.tag, styles.tagTitle]}>
              <Text style={styles.tagTitleText}>{t.eventDetail.titleFight}</Text>
            </View>
          )}
        </View>
      )}
      <View style={styles.matchup}>
        <FighterCell fighter={fight.fighter1} align="left" outcome={fightOutcome(fight, fight.fighter1?.id)} styles={styles} t={t} />
        <View style={styles.centerMeta}>
          {weight && <Text style={styles.weightClass}>{weight}</Text>}
          {rounds && <Text style={styles.roundsText}>{rounds}</Text>}
        </View>
        <FighterCell fighter={fight.fighter2} align="right" outcome={fightOutcome(fight, fight.fighter2?.id)} styles={styles} t={t} />
      </View>
      {(fight.result_method_detail || fight.result_method) && (
        <Text style={styles.result}>
          {t.eventDetail.resultVia} {fight.result_method_detail ?? fight.result_method}
          {fight.result_round ? ` · ${t.eventDetail.round} ${fight.result_round}` : ''}
          {fight.result_time ? ` (${fight.result_time})` : ''}
        </Text>
      )}
      {isVotable(fight) && <FightVoteRow fight={fight} summary={voteSummary} onVote={onVote} styles={styles} t={t} />}
    </View>
  );
}

export default function EventDetailScreen({ route, navigation }: Props) {
  const { eventId, eventName } = route.params;
  const { t, locale } = useLocale();
  const { timezoneOverride } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [fights, setFights] = useState<Fight[]>([]);
  const [votes, setVotes] = useState<Map<string, FightVoteSummary>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([getEventDetail(eventId), getFightsForEvent(eventId)])
      .then(([eventData, fightsData]) => {
        setEvent(eventData);
        setFights(fightsData);
      })
      .catch(() => setError(t.common.error))
      .finally(() => setLoading(false));
  };

  useEffect(load, [eventId, t]);

  // Separate from the main load — a vote-fetch failure must not block the
  // fight card from rendering. Only the votable fights are queried.
  useEffect(() => {
    const votable = fights.filter(isVotable);
    if (votable.length === 0) return;
    getEventVotes(votable.map((f) => ({ id: f.id, fighter1_id: f.fighter1!.id, fighter2_id: f.fighter2!.id })))
      .then(setVotes)
      .catch(() => {});
  }, [fights]);

  // Optimistic: reflect the tap immediately (move this device's vote, adjust
  // the tallies), then persist. A failed write just leaves the optimistic
  // state — acceptable for a low-stakes community poll.
  const handleVote = (fightId: string, fighterId: string) => {
    const fight = fights.find((f) => f.id === fightId);
    if (!fight?.fighter1 || !fight.fighter2) return;

    setVotes((prev) => {
      const next = new Map(prev);
      const current = next.get(fightId) ?? { fighter1Votes: 0, fighter2Votes: 0, myVote: null };
      let { fighter1Votes, fighter2Votes } = current;
      if (current.myVote === fight.fighter1!.id) fighter1Votes -= 1;
      if (current.myVote === fight.fighter2!.id) fighter2Votes -= 1;
      if (fighterId === fight.fighter1!.id) fighter1Votes += 1;
      if (fighterId === fight.fighter2!.id) fighter2Votes += 1;
      next.set(fightId, { fighter1Votes, fighter2Votes, myVote: fighterId });
      return next;
    });

    castVote(fightId, fighterId).catch(() => {});
  };

  const emptyVoteSummary: FightVoteSummary = { fighter1Votes: 0, fighter2Votes: 0, myVote: null };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale === 'de' ? 'de-DE' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
      ...(timezoneOverride ? { timeZone: timezoneOverride } : {}),
      ...(timezoneOverride ? { timeZone: timezoneOverride } : {}),
    });

  const segmentStart: Record<CardSegment, string | null> = {
    main_card: event?.main_card_start_time ?? null,
    prelims: event?.prelims_start_time ?? null,
    early_prelims: event?.early_prelims_start_time ?? null,
  };
  const segmentLabel: Record<CardSegment, string> = {
    main_card: t.eventDetail.mainCard,
    prelims: t.eventDetail.prelims,
    early_prelims: t.eventDetail.earlyPrelims,
  };

  const groups = useMemo(() => {
    const out: { key: string; title: string | null; startTime: string | null; fights: Fight[] }[] = [];
    for (const seg of SEGMENT_ORDER) {
      const segFights = fights.filter((f) => f.card_segment === seg);
      if (segFights.length) out.push({ key: seg, title: segmentLabel[seg], startTime: segmentStart[seg], fights: segFights });
    }
    const rest = fights.filter((f) => !f.card_segment || !SEGMENT_ORDER.some((s) => s === f.card_segment));
    if (rest.length) out.push({ key: 'other', title: null, startTime: null, fights: rest });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fights, event]);

  const header = (
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
      title={t.eventDetail.screenTitle.toUpperCase()}
      right={
        <>
          {event && isEventUpcoming(event.event_date) && (
            <EventReminderBell inline eventId={eventId} eventName={event.name} eventDateIso={event.event_date} />
          )}
          <EventFavoriteHeart inline eventId={eventId} />
        </>
      }
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

  return (
    <Screen>
      {header}
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.eventInfo}>
          {event && isEventLive(event) && (
            <View style={styles.liveBadgeSlot}>
              <LiveBadge />
            </View>
          )}
          {event?.status === 'cancelled' && (
            <View style={[styles.tag, styles.tagCancelled, styles.cancelledBanner]}>
              <Text style={styles.tagCancelledText}>{t.eventDetail.eventCancelled}</Text>
            </View>
          )}
          {event?.organizations?.short_name && (
            <View style={styles.orgRow}>
              <Text style={styles.orgName}>{event.organizations.short_name}</Text>
              <OrganizationFollowBell organizationId={event.organization_id} />
            </View>
          )}
          <Text style={styles.eventName}>{event?.name ?? eventName}</Text>
          {event && (
            <Text style={styles.eventDate}>
              {formatEventDateTime(event.event_date, locale, 'long', timezoneOverride ?? undefined).toUpperCase()}
            </Text>
          )}
          {event && (event.venue || event.city || event.venue_state || event.country) && (
            <View style={styles.locationRow}>
              <Flag country={event.country} height={12} />
              <Text style={styles.eventMeta}>
                {[event.venue, event.city, event.venue_state, event.country].filter(Boolean).join(', ')}
              </Text>
            </View>
          )}
        </View>

        {groups.length === 0 ? (
          <EmptyState title={t.eventDetail.emptyFightCard} />
        ) : (
          groups.map((group) => (
            <Card key={group.key} style={styles.groupCard}>
              {group.title && (
                <View style={styles.groupHeader}>
                  <Text style={styles.groupTitle}>{group.title}</Text>
                  {group.startTime && (
                    <Text style={styles.groupStarts}>
                      {t.eventDetail.starts} {formatTime(group.startTime)}
                    </Text>
                  )}
                </View>
              )}
              {group.fights.map((fight) => (
                <FightRow
                  key={fight.id}
                  fight={fight}
                  voteSummary={votes.get(fight.id) ?? emptyVoteSummary}
                  onVote={handleVote}
                  t={t}
                  styles={styles}
                />
              ))}
            </Card>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    centered: { marginTop: 40 },
    scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },

    eventInfo: { marginBottom: spacing.lg },
    liveBadgeSlot: { marginBottom: spacing.sm, alignSelf: 'flex-start' },
    cancelledBanner: { alignSelf: 'flex-start', marginBottom: spacing.sm },
    orgRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xs },
    orgName: { ...typography.label, color: colors.focus },
    eventName: { ...typography.display, color: colors.textPrimary, marginBottom: spacing.sm },
    eventDate: {
      ...typography.compact,
      ...tabularNums,
      fontFamily: typography.label.fontFamily,
      letterSpacing: 0.5,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
    },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    eventMeta: { ...typography.meta, color: colors.textSecondary, flexShrink: 1 },

    groupCard: { padding: 0, marginBottom: spacing.lg },
    groupHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    groupTitle: { ...typography.label, color: colors.textSecondary },
    groupStarts: { ...typography.meta, ...tabularNums, color: colors.textSecondary },

    fightRow: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.divider,
    },
    cancelled: { opacity: 0.5 },
    bannerRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.sm },
    tag: { borderRadius: 8, paddingHorizontal: spacing.sm, paddingVertical: 3, overflow: 'hidden' },
    tagMain: { backgroundColor: colors.accent },
    tagMainText: { ...typography.caption, color: '#FFFFFF' },
    tagTitle: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.alloy },
    tagTitleText: { ...typography.caption, color: colors.alloy },
    tagCancelled: { backgroundColor: colors.danger },
    tagCancelledText: { ...typography.caption, color: '#FFFFFF' },

    matchup: { flexDirection: 'row', alignItems: 'center' },
    fighterCell: { flex: 1, gap: spacing.xs },
    alignStart: { alignItems: 'flex-start' },
    alignEnd: { alignItems: 'flex-end' },
    fighterHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    rowReverse: { flexDirection: 'row-reverse' },
    fighterNameWrap: { flexShrink: 1 },
    fighterName: { ...typography.cardTitle, fontSize: 16, lineHeight: 20, color: colors.textPrimary },
    textRight: { textAlign: 'right' },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    record: { ...typography.meta, ...tabularNums, color: colors.textSecondary },

    // WIN/LOSS/DRAW/NC result pills, shown next to the record on completed
    // fights (replacing the old winner-name colouring). WIN is the filled
    // cobalt accent; everything else is a muted outline so a card of results
    // stays calm — no green/red trade dress, matching the Blue Alloy system.
    resultBadge: {
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderWidth: StyleSheet.hairlineWidth,
    },
    resultBadgeText: { ...typography.caption, fontSize: 10, letterSpacing: 0.5 },
    badgeWin: { backgroundColor: colors.accent, borderColor: colors.accent },
    badgeWinText: { color: '#FFFFFF' },
    badgeLoss: { backgroundColor: 'transparent', borderColor: colors.border },
    badgeLossText: { color: colors.textSecondary },
    badgeNeutral: { backgroundColor: 'transparent', borderColor: colors.alloyMuted },
    badgeNeutralText: { color: colors.alloy },

    voteRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    voteButton: {
      flex: 1,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.control,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
    },
    voteButtonText: { ...typography.caption, color: colors.textPrimary },
    voteBarContainer: { marginTop: spacing.md },
    voteBarLabelsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4, gap: spacing.sm },
    voteBarLabel: { ...typography.caption, color: colors.textSecondary, flexShrink: 1 },
    voteBarLabelActive: { color: colors.accent, fontFamily: typography.label.fontFamily },
    voteBarTrack: {
      flexDirection: 'row',
      height: 8,
      borderRadius: 4,
      overflow: 'hidden',
      backgroundColor: colors.border,
    },
    voteBarFill1: { backgroundColor: colors.accent },
    voteBarFill2: { backgroundColor: colors.surfaceAlt },

    centerMeta: { alignItems: 'center', paddingHorizontal: spacing.sm },
    weightClass: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
    roundsText: { ...typography.caption, ...tabularNums, color: colors.textSecondary, textAlign: 'center' },
    result: {
      ...typography.meta,
      color: colors.textSecondary,
      fontStyle: 'italic',
      textAlign: 'center',
      marginTop: spacing.sm,
    },
  });

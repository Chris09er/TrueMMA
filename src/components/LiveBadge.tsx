import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useLocale } from '../lib/i18n';
import { radius, useTheme, type ColorTokens } from '../lib/theme';

export default function LiveBadge() {
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.35, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

  return (
    <Animated.View style={[styles.badge, { opacity }]}>
      <Text style={styles.text}>{t.common.live}</Text>
    </Animated.View>
  );
}

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    badge: {
      alignSelf: 'flex-start',
      // Deliberately `live`, not `danger` — live is urgent, not negative.
      backgroundColor: colors.live,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: radius.control,
    },
    text: {
      color: '#fff',
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
  });

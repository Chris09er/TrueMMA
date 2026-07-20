import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { flagSvgForCountry } from '../lib/countryFlags';

// A small country flag rendered from country-flag-icons' SVG string via
// react-native-svg (see src/lib/countryFlags.ts). Renders nothing when the
// country name has no mapping, so it's always safe to drop in next to a name.
//
// Deliberately theme-independent: the hairline frame uses a semi-transparent
// grey that reads on both light and dark surfaces, so this can be used inside
// a FlatList row without a useTheme() context read per item (the same reason
// the screen-local row helpers take `styles` as a prop rather than calling
// useTheme themselves — see docs/ARCHITECTURE.md, theme.tsx).
export default function Flag({
  country,
  height = 14,
}: {
  country: string | null | undefined;
  height?: number;
}) {
  const xml = flagSvgForCountry(country);
  if (!xml) return null;

  // country-flag-icons' 3x2 flags have a 3:2 aspect ratio.
  const width = Math.round((height * 3) / 2);

  return (
    <View
      style={[
        styles.frame,
        { width, height, borderRadius: Math.max(2, Math.round(height / 6)) },
      ]}
      accessibilityRole="image"
      accessibilityLabel={country ?? undefined}
    >
      <SvgXml xml={xml} width={width} height={height} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(128,128,128,0.35)',
  },
});

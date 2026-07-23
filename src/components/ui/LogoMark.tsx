import Svg, { Polygon, Path } from 'react-native-svg';
import { useTheme } from '../../lib/theme';

// True MMA brand mark (final vector).
// Design (see docs/DESIGN_HANDOFF.md): a geometric slab "T" in silver alloy,
// centered inside a regular flat-top octagon whose outer contour is silver
// alloy. The restrained inner contour is split down the middle — cobalt on the
// left, red on the right — echoing the blue and red corners of an MMA bout.
// Drawn on a 100x100 viewBox so it scales crisply to the small header sizes it
// ships at (22–30px).

const R = 0.2929; // regular flat-top octagon corner-cut ratio (1 - 1/(1+√2)/…)
const CORNER_RED = '#E5484D';

// Vertices of a regular flat-top octagon inset by `p` inside the 100 viewBox,
// starting at the top-left corner and going clockwise.
function octagonPoints(p: number): Array<[number, number]> {
  const s = 100 - p * 2;
  return [
    [p + R * s, p], // 0 top edge, left end
    [p + (1 - R) * s, p], // 1 top edge, right end
    [p + s, p + R * s], // 2 right-top
    [p + s, p + (1 - R) * s], // 3 right-bottom
    [p + (1 - R) * s, p + s], // 4 bottom edge, right end
    [p + R * s, p + s], // 5 bottom edge, left end
    [p, p + (1 - R) * s], // 6 left-bottom
    [p, p + R * s], // 7 left-top
  ];
}

const fmt = (pts: Array<[number, number]>) => pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
const polyline = (pts: Array<[number, number]>) =>
  pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');

// Split the inner octagon into a left and a right half at the mid-points of the
// top and bottom edges, so each half can carry its own corner colour.
function innerHalves(p: number): { left: string; right: string } {
  const pts = octagonPoints(p);
  const mid = 50; // horizontal centre of the viewBox
  const topMid: [number, number] = [mid, pts[0][1]];
  const bottomMid: [number, number] = [mid, pts[4][1]];
  const right = polyline([topMid, pts[1], pts[2], pts[3], pts[4], bottomMid]);
  const left = polyline([bottomMid, pts[5], pts[6], pts[7], pts[0], topMid]);
  return { left, right };
}

// Geometric slab "T" as one filled path — even stroke weight on bar and stem
// so it stays solid and legible when scaled down. bar thickness == stem width.
const T_PATH = ['M32 33', 'H68', 'V42', 'H54.5', 'V69', 'H45.5', 'V42', 'H32', 'Z'].join(' ');

export default function LogoMark({ size = 28 }: { size?: number }) {
  const { colors } = useTheme();
  const inner = innerHalves(15);
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="True MMA">
      {/* outer silver octagon contour */}
      <Polygon points={fmt(octagonPoints(7))} fill="none" stroke={colors.alloy} strokeWidth={6} strokeLinejoin="round" />
      {/* inner contour: cobalt (blue corner) left, red corner right */}
      <Path d={inner.left} fill="none" stroke={colors.accent} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Path d={inner.right} fill="none" stroke={CORNER_RED} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      {/* centered silver slab T */}
      <Path d={T_PATH} fill={colors.alloy} />
    </Svg>
  );
}

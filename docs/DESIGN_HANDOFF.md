# True MMA — Design Handoff

## Status and authority

**Approved direction: Carbon & Ice — Frost Haze (dark).** This document is the implementation brief for the redesign. Do not substitute a different palette, rearrange screens, or add a new visual concept without a new design decision.

The two approved colour references are preview-only (not shipped assets):

- `docs/design-references/event-list-blue-alloy-reference.png` (superseded visual direction; use layout only)
- `docs/design-references/event-detail-blue-alloy-reference.png` (superseded visual direction; use layout only)

The final visual reference is the conversation direction **“Carbon & Ice — Frost Haze”**: carbon surfaces, noticeably lighter and airier desaturated ice-blue haze, and no bright cobalt wash. Its event-list and fight-card layouts are the target.

## Product intent

True MMA is the reliable companion for casual and hardcore MMA fans. Its first job is to show the next relevant fights; depth comes after. German is the primary market and English launches at equal quality. Every layout must tolerate longer German text.

## Brand and colour system

### Carbon & Ice — Frost Haze dark tokens

Use these as the initial implementation tokens; do not make per-screen colour decisions.

| Token | Value | Use |
| --- | --- | --- |
| `background.canvas` | `#151B20` | Screen canvas |
| `background.surface` | `#1E2A33` | Cards and grouped fight-card surface |
| `background.elevated` | `#263543` | Active/raised surfaces only |
| `text.primary` | `#F3F7FA` | Headings and fighter names |
| `text.secondary` | `#B8CBD7` | Body and date/location information |
| `text.muted` | `#8299A7` | Supporting metadata |
| `border.subtle` | `#3A515D` | Dividers and quiet outlines |
| `accent.ice` | `#B9D8E8` | Primary interaction, active state, focus |
| `accent.iceStrong` | `#7FB6CF` | Filled active state / small emphasis |
| `accent.iceDeep` | `#335466` | Gradient depth / selected fill base |

- Gradients are welcome only as **static, low-contrast material depth**: e.g. carbon `#151B20 → #263543` with a broad, diffused desaturated ice-blue haze behind a header or major surface. No rainbow, high-saturation blue wash, animated shimmer, cage texture, or glossy “gaming” look.
- Standard cards remain quiet: dark surface, thin border, modest shadow only when needed to separate layers.
- Avoid UFC/OKTAGON trade dress, red-black branding, neon, lime, purple and organisation-specific colour identity.
- The approved logo is unchanged by this palette: silver octagon/T mark with blue-left/red-right inner contour and the small `M M A` lettering. The installed raster app-icon files are production-ready for builds; retain a vector master for future wordmark/marketing use. Do not recreate the wordmark as a generated image.

## Typography and layout

- Display headings and fighter names: **Barlow Condensed** Bold/SemiBold.
- Body, labels, dates, tables and records: **Inter**.
- Existing families are already installed; do not add a font dependency.
- Type scale: display 32/36, section 24/28, card title 19/23, body 16/24, compact 14/20, meta 13/18, label 12/16, caption 11/14.
- Use tabular numerals for times, dates, records, rankings and data columns.
- 8-point grid: 8, 12, 16, 24, 32. Cards/sheets: 14pt radius and 16pt inset. Buttons/chips: 10pt radius. Interactive targets must be at least 44×44pt, even where a visual chip is smaller.
- Flags supplement — never replace — country text. Use the existing `Flag` component, never emoji flags.

## Event list

- Header: brand mark/wordmark at left, calendar at right.
- Compact filters, including reachable **Vergangene Events / Past events**.
- Group order: Today when populated (live first), then This week, then later date groups; do not show an empty Today group.
- Event-card content order: league, event name (larger), exact weekday/date/time, then flag + arena + city + country.
- Every event card carries heart and bell actions in its top-right zone.
- No oversized “next event” hero.

## Event detail / fight card

- Header: back action left, centered final mark, one 44pt heart action right. Keep all three zones balanced.
- Event information: league, full event name, exact weekday/date/time, then flag + arena + city + country.
- Keep Main Card / Prelims grouping. Main Event is a normal fight row with a small `MAIN EVENT` banner — not an oversized special card.
- Every fight row: country flags by each name; **both fighter names use `text.primary`**; records sit below names; weight class and rounds use quiet centered metadata.
- Compact `TIPP` chip appears in **every upcoming fight row**, centered below division/rounds. It is a trigger, not a two-choice layout inside the row. Tap target is 44pt; the visual chip may be roughly 26–28pt tall.
- Tapping `TIPP` opens the favourite-choice flow. Before selection both choices are neutral. After selection the selected fighter receives the Carbon & Ice active state plus a check and confirmation; do not imply a real result and do not show social percentages/counts.
- Once a fight has started or finished, remove the vote trigger. Finished fights use the result line instead.

### Result states

Both names remain white. Mark the outcome with a compact adjacent badge, never by changing the fighter-name colour:

| State | Badge | Colour |
| --- | --- | --- |
| Winner | `WIN` | emerald `#178B5B`, white text |
| Loser | `LOSS` | muted crimson `#B83A45`, white text |
| Draw | `DRAW` | amber `#B98218`, near-black text |
| No contest | `NC` | graphite `#566274`, white text |

## Other screens

- Fighter list follows Event-list filtering. Fighter flag occupies the left identity position, with name and metadata separated by quiet dividers. No portraits until real assets exist.
- Fighter detail uses the same Carbon & Ice hierarchy. Include flag, record, weight class, height, reach, stance, date of birth, KO wins, submission wins and win streak; use a neutral fallback until portraits exist.
- Profile remains the visual quality bar. Use the same restrained Carbon & Ice material depth. Guest mode is gray/metallic, not a saturated accent card. Theme and language/timezone settings live here.
- Language remains a clear DE/EN choice. Contact has topic selection, message input and one primary send action.

## States, accessibility and performance

- Loading: calm skeletons; no perpetual shimmer.
- Empty: explain the state and offer a useful next action.
- Error: explicit text plus retry; never rely on colour alone.
- Validate contrast in dark mode, focus visibility and 44pt targets.
- Keep gradients static. Avoid expensive blur and continuous animation; interactions must remain smooth on weaker Android devices.

## Implementation and verification

- Read `AGENTS.md` and Expo SDK 54 documentation before code changes.
- Preserve complete DE/EN i18n parity and test long German labels.
- Prefer existing dependencies. Before any native dependency change, report whether a new EAS development build is required.
- The icon files in `assets/` were replaced and `app.json` already references them. A fresh native standalone/EAS build is required to verify the installed app icon; Expo Go does not validate it.
- Validate critical work on a real standalone build before declaring it complete.
- Update `docs/ARCHITECTURE.md` and `docs/ecosystem-overview.html` only when their documented technical terrain changes.
- Propose commits; do not create them without approval.

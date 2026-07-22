# True MMA — Design-Handoff

## Status

Design direction approved. Do not invent a different palette, typography, or screen hierarchy.
Implement only after the final vector logo asset is supplied.

## Visual reference previews

These images are **preview-only visual references** for implementation. They are not production assets,
must not be shipped, and must not replace the final vector logo, real fighter imagery, i18n copy, or the
existing Flag component.

- `docs/design-references/event-list-blue-alloy-reference.png`
- `docs/design-references/event-detail-blue-alloy-reference.png`
- `docs/design-references/profile-fighter-detail-blue-alloy-reference.png`

> **Superseded detail:** the Profile reference shows an exploratory three-way theme
> picker (Blue Alloy / Steel / Onyx). This is outdated. Blue Alloy is the only brand
> direction and ships in **Dark and Light** only; "Steel" and "Onyx" are not
> selectable themes and must be ignored.

## Product intent

True MMA is the reliable companion for both casual and hardcore MMA fans.
Primary job: show when the next relevant fights take place, then provide depth.
German is the core market; English launches at the same quality. Layouts must tolerate longer German copy.

## Brand / visual identity

- Direction: **Blue Alloy**.
- Dark first, with a fully equivalent Light theme in the first redesign release.
- Dark base: `#050C1C`; surfaces: `#0B1830` / `#10213B`; divider: `#263954`.
- Primary interactive cobalt: `#2367C9`; focus/link blue: `#63A0FF`.
- Alloy: `#D8DEE7` and `#7D8A9B`, reserved for the logo and rare premium accents.
- Use a subtle deep-navy/blue background gradient; gradients must be static and restrained.
- No red-black trade dress, neon, lime, purple, cage mesh, or UFC/OKTAGON visual imitation.
- Final logo: centered sharp silver T inside a regular octagon with restrained cobalt inner contour. The current mock-up is reference-only; final mark must be a vector asset. Do not generate the wordmark as an image.

## Typography

- Display / headings / fighter names: Barlow Condensed (Bold/SemiBold).
- Body, labels, dates, tables, records: Inter.
- Current project already includes both font families; no new font dependency is needed.
- Scale: display 32/36, section 24/28, card title 19/23, body 16/24, compact 14/20, meta 13/18, label 12/16, caption 11/14.
- Use tabular numerals for times, dates, records, rankings, and data columns.

## System rules

- 8-point spacing grid: 8, 12, 16, 24, 32.
- Cards/sheets: 14pt radius, 16pt inset; hero only 20pt.
- Buttons/chips/inputs: 10pt radius; interactive targets at least 44x44pt.
- Standard cards are quiet with thin border; the 3pt Blue-Alloy top edge is only for promoted/active content.
- Flags always supplement, never replace, the country text. Use the existing Flag component; do not use emoji flags.
- Main visual actions are cobalt; secondary actions outlined/quiet.
- Loading uses calm skeletons, no perpetual shimmer. Empty states include useful action. Errors include retry and text, not color alone.

## Screen specifications

### Event list

- Header: brand symbol/wordmark left, calendar icon right.
- Search + filters are compact; offer a clearly reachable **Past events / Vergangene Events** option.
- Group order: Today when populated (live first), then This week, then later date groups. Do not show empty Today.
- Each event card order: league (small), event name (larger), exact weekday + date + time, then Flag + arena + city + country.
- Bell and heart are in every event card's top-right corner.
- No large "next event" hero card.

### Event detail

- Header: back left, centered final symbol, 44pt bell and heart actions right; all three zones balanced.
- Show league, full event name, exact weekday/date/time, then Flag + arena/city/country.
- Main Event is a regular fight-card with a small Main Event banner, not a separate oversized visual language.
- Keep Main Card / Prelims grouping.
- No win-pick/voting controls.
- Every fight: flags next to names; records below names; weight class and rounds as secondary Inter metadata.

### Fighter list

- Filters follow the Event-list pattern.
- Fighter row: country flag at the left identity position (where the temporary initials were), then fighter name and metadata; retain subtle dividers.
- Avoid portraits until real assets exist.

### Fighter detail

- Must use the same Blue Alloy and Barlow/Inter hierarchy as other screens.
- No portrait until assets exist; use a quiet neutral fallback.
- Country flag belongs next to the fighter name.
- Show record, weight class, height, reach, stance, date of birth, KO wins, submission wins, and win streak.

### Profile

- Best reference screen for overall finish level.
- Use subtle Blue Alloy gradient as global background treatment.
- Guest-mode card is gray/metallic rather than cobalt; spacing below the Profile title is compact.
- Theme selection exists here only; language and timezone live here too.

### Language and Contact

- Language is a simple DE/EN selection with clear active state.
- Contact uses a topic selector, message field, and one primary send action.

## Implementation / verification

- Read `AGENTS.md` and versioned Expo SDK 54 docs before coding.
- Preserve i18n DE/EN. Test long German labels and data wrapping.
- Confirm contrast for both themes and visible focus state.
- Use existing dependencies where possible. Before a native dependency change, inform the user whether an EAS dev build is required.
- Validate on a standalone build before declaring the redesign complete.
- Update `docs/ARCHITECTURE.md` and `docs/ecosystem-overview.html` only when the respective documented terrain changes.
- Propose a checkpoint commit; do not commit without approval.

## Open input required

The final vector logo asset / source is not in the repository yet. Do not ship a generated raster logo as the final app icon or brand mark.

export function formatEventDate(
  isoDate: string,
  locale: string,
  weekdayStyle: 'short' | 'long' = 'short',
  timeZone?: string
): string {
  return new Date(isoDate).toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-US', {
    weekday: weekdayStyle,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  });
}

// Same date rendering as formatEventDate, plus the start time, joined with a
// middot. Time is shown in the user's chosen timezone (falls back to the
// device zone). The handoff requires "exact weekday + date + time" on the
// event list and detail; event_date is a real timestamptz so the time is
// meaningful, not a midnight placeholder.
export function formatEventDateTime(
  isoDate: string,
  locale: string,
  weekdayStyle: 'short' | 'long' = 'short',
  timeZone?: string
): string {
  const bcp47 = locale === 'de' ? 'de-DE' : 'en-US';
  const date = new Date(isoDate);
  const datePart = date.toLocaleDateString(bcp47, {
    weekday: weekdayStyle,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  });
  const timePart = date.toLocaleTimeString(bcp47, {
    hour: '2-digit',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  });
  return `${datePart} · ${timePart}`;
}

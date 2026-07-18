export function formatEventDate(
  isoDate: string,
  locale: string,
  weekdayStyle: 'short' | 'long' = 'short'
): string {
  return new Date(isoDate).toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-US', {
    weekday: weekdayStyle,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

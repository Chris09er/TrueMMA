// Curated list, not all ~400 IANA zones — relevant to an MMA audience
// (major US zones since most UFC cards originate there, plus the regions
// this app's DE/EN audience is likely to want). `value: null` means "device
// default" (clears the override).
export const TIMEZONE_OPTIONS: { value: string | null; label: { de: string; en: string } }[] = [
  { value: null, label: { de: 'Gerätezeitzone', en: 'Device timezone' } },
  { value: 'America/New_York', label: { de: 'US-Ostküste (New York)', en: 'US Eastern (New York)' } },
  { value: 'America/Chicago', label: { de: 'US-Zentral (Chicago)', en: 'US Central (Chicago)' } },
  { value: 'America/Denver', label: { de: 'US-Mountain (Denver)', en: 'US Mountain (Denver)' } },
  { value: 'America/Los_Angeles', label: { de: 'US-Westküste (Los Angeles)', en: 'US Pacific (Los Angeles)' } },
  { value: 'Europe/London', label: { de: 'Vereinigtes Königreich (London)', en: 'United Kingdom (London)' } },
  { value: 'Europe/Berlin', label: { de: 'Mitteleuropa (Berlin)', en: 'Central Europe (Berlin)' } },
  { value: 'America/Sao_Paulo', label: { de: 'Brasilien (São Paulo)', en: 'Brazil (São Paulo)' } },
  { value: 'Australia/Sydney', label: { de: 'Australien-Ost (Sydney)', en: 'Australia East (Sydney)' } },
  { value: 'Asia/Tokyo', label: { de: 'Japan (Tokio)', en: 'Japan (Tokyo)' } },
];
